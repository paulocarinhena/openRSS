import "server-only";
import type { Rule } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { serializeError } from "@/lib/localized-error";
import {
  compileRule,
  needsScore,
  parseActions,
  parseConditions,
  toRuleArticle,
  WEBHOOK_FORMATS,
  type RuleAction,
  type RuleArticle,
  type WebhookFormat,
} from "./engine";
import { sendWebhook } from "./webhook";

/** "ingest": logo após baixar (regras de texto). "classified": após a IA dar nota (regras com nota). */
export type RulePhase = "ingest" | "classified";

/** Notificações só para artigos que acabaram de chegar, e no máximo algumas por regra a cada rodada. */
const NOTIFY_MAX_AGE_MS = 24 * 3600_000;
const NOTIFY_MAX_PER_RUN = 10;

type CompiledRule = {
  rule: Rule;
  actions: RuleAction[];
  test: (a: RuleArticle) => boolean;
  scoreBased: boolean;
};

export function compile(rule: Rule): CompiledRule | null {
  const conditions = parseConditions(rule.conditions);
  const actions = parseActions(rule.actions);
  if (conditions.length === 0 || actions.length === 0) return null;
  return { rule, actions, test: compileRule({ matchAll: rule.matchAll, conditions }), scoreBased: needsScore(conditions) };
}

type Subscription = { feedId: string; folderId: string | null };

export function inScope(rule: Pick<Rule, "scope" | "scopeId">, feedId: string, subscription: Subscription | undefined) {
  if (!subscription) return false;
  if (rule.scope === "feed") return rule.scopeId === feedId;
  if (rule.scope === "folder") return rule.scopeId !== null && rule.scopeId === subscription.folderId;
  return true;
}

/** Grava as ações no estado do usuário. Só liga marcadores: uma regra nunca desmarca lido/salvo. */
export async function writeActions(userId: string, byArticle: Map<string, Set<RuleAction>>) {
  const now = new Date();
  const writes = [...byArticle].map(([articleId, actions]) => {
    const data = {
      ...(actions.has("markRead") ? { isRead: true, readAt: now } : {}),
      ...(actions.has("save") ? { isSaved: true, savedAt: now } : {}),
      ...(actions.has("highlight") ? { isHighlighted: true } : {}),
    };
    return Object.keys(data).length
      ? db.userArticle.upsert({
          where: { userId_articleId: { userId, articleId } },
          create: { userId, articleId, ...data },
          update: data,
        })
      : null;
  });
  const pending = writes.filter((w) => w !== null);
  for (let i = 0; i < pending.length; i += 200) await db.$transaction(pending.slice(i, i + 200));
}

/**
 * Aplica as regras ativas aos artigos recém-chegados.
 * Cada usuário só é afetado nos feeds que assina, e só no próprio estado (UserArticle).
 */
export async function applyRulesToArticles(articleIds: string[], phase: RulePhase, onlyUserId?: string) {
  if (articleIds.length === 0) return;
  const articles = await db.article.findMany({
    where: { id: { in: articleIds } },
    select: { id: true, feedId: true, title: true, url: true, author: true, contentHtml: true, snippet: true, createdAt: true, feed: { select: { title: true } } },
  });
  if (articles.length === 0) return;

  const feedIds = [...new Set(articles.map((a) => a.feedId))];
  const rules = await db.rule.findMany({
    where: {
      enabled: true,
      ...(onlyUserId ? { userId: onlyUserId } : {}),
      user: { subscriptions: { some: { feedId: { in: feedIds } } } },
    },
  });
  const compiled = rules.map(compile).filter((r): r is CompiledRule => r !== null && r.scoreBased === (phase === "classified"));
  if (compiled.length === 0) return;

  const userIds = [...new Set(compiled.map((r) => r.rule.userId))];
  const [subscriptions, states] = await Promise.all([
    db.subscription.findMany({ where: { userId: { in: userIds }, feedId: { in: feedIds } }, select: { userId: true, feedId: true, folderId: true } }),
    phase === "classified"
      ? db.userArticle.findMany({ where: { userId: { in: userIds }, articleId: { in: articleIds } }, select: { userId: true, articleId: true, priorityScore: true } })
      : Promise.resolve([]),
  ]);
  const subOf = new Map(subscriptions.map((s) => [`${s.userId}:${s.feedId}`, s]));
  const scoreOf = new Map(states.map((s) => [`${s.userId}:${s.articleId}`, s.priorityScore]));

  for (const userId of userIds) {
    const userRules = compiled.filter((r) => r.rule.userId === userId);
    const byArticle = new Map<string, Set<RuleAction>>();
    for (const entry of userRules) {
      let hits = 0;
      let notified = 0;
      for (const article of articles) {
        if (!inScope(entry.rule, article.feedId, subOf.get(`${userId}:${article.feedId}`))) continue;
        const candidate = toRuleArticle({ ...article, score: scoreOf.get(`${userId}:${article.id}`) ?? null });
        if (!entry.test(candidate)) continue;
        hits++;
        const set = byArticle.get(article.id) ?? new Set<RuleAction>();
        entry.actions.forEach((a) => set.add(a));
        byArticle.set(article.id, set);

        const fresh = Date.now() - article.createdAt.getTime() < NOTIFY_MAX_AGE_MS;
        if (entry.actions.includes("notify") && fresh && notified < NOTIFY_MAX_PER_RUN) {
          notified++;
          await notify(entry.rule, { id: article.id, title: article.title, url: article.url, feed: article.feed.title, score: candidate.score });
        }
      }
      if (hits > 0) {
        await db.rule.update({ where: { id: entry.rule.id }, data: { hitCount: { increment: hits }, lastHitAt: new Date() } });
      }
    }
    if (byArticle.size > 0) await writeActions(userId, byArticle);
  }
}

async function notify(rule: Rule, article: { id: string; title: string; url: string | null; feed: string; score: number | null }) {
  const format = (WEBHOOK_FORMATS as readonly string[]).includes(rule.webhookFormat ?? "") ? (rule.webhookFormat as WebhookFormat) : "json";
  if (!rule.webhookEncrypted) return;
  try {
    await sendWebhook(decrypt(rule.webhookEncrypted), format, { rule: rule.name, article });
  } catch (error) {
    console.error(`[rules:notify] rule=${rule.id}`, serializeError(error));
  }
}
