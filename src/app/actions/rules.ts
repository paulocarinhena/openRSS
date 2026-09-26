"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/session";
import { actionErrorMessage } from "@/lib/action-errors";
import { localizeError } from "@/lib/localized-error";
import {
  actionsSchema,
  compileRule,
  conditionsSchema,
  RULE_SCOPES,
  toRuleArticle,
  WEBHOOK_FORMATS,
  type RuleAction,
} from "@/lib/rules/engine";
import { compile, inScope, writeActions } from "@/lib/rules/apply";
import { assertWebhookUrl, sendWebhook } from "@/lib/rules/webhook";

// Mensagens do zod são chaves de rules.errors.
const draftSchema = z.object({
  scope: z.enum(RULE_SCOPES),
  scopeId: z.string().nullable().optional(),
  matchAll: z.boolean(),
  conditions: conditionsSchema,
});

const ruleSchema = draftSchema.extend({
  id: z.string().optional(),
  name: z.string().trim().min(1, "nameRequired").max(80, "nameTooLong"),
  enabled: z.boolean().default(true),
  actions: actionsSchema,
  webhookUrl: z.string().trim().max(2000).optional(), // vazio = manter o atual
  webhookFormat: z.enum(WEBHOOK_FORMATS).optional(),
});

export type RuleInput = z.input<typeof ruleSchema>;
export type RuleDraft = z.input<typeof draftSchema>;

const errors = () => getTranslations("rules.errors");

type Fail = { ok: false; error: string };

async function fail(err: unknown): Promise<Fail> {
  if (err instanceof z.ZodError) return { ok: false, error: actionErrorMessage(await errors(), err) };
  return { ok: false, error: localizeError(err, await getLocale()) };
}

/** Feed e pasta do escopo precisam ser do usuário. */
async function assertScope(userId: string, scope: string, scopeId: string | null | undefined) {
  if (scope === "all") return null;
  if (!scopeId) return false;
  const ok =
    scope === "feed"
      ? await db.subscription.count({ where: { userId, feedId: scopeId } })
      : await db.folder.count({ where: { userId, id: scopeId } });
  return ok ? scopeId : false;
}

async function ownedRule(userId: string, id: string) {
  return db.rule.findFirst({ where: { id, userId } });
}

export async function saveRuleAction(input: RuleInput): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  const t = await errors();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const { id, webhookUrl, webhookFormat, scopeId: rawScopeId, conditions, actions, ...rest } = parsed.data;

  const scopeId = await assertScope(user.id, rest.scope, rawScopeId);
  if (scopeId === false) return { ok: false, error: t("scopeNotFound") };

  const existing = id ? await ownedRule(user.id, id) : null;
  if (id && !existing) return { ok: false, error: t("ruleNotFound") };

  const notify = actions.includes("notify");
  let webhookEncrypted: string | null = null;
  if (notify) {
    const format = webhookFormat ?? "json";
    if (webhookUrl) {
      if (!z.url().safeParse(webhookUrl).success) return { ok: false, error: t("webhookInvalid") };
      try {
        await assertWebhookUrl(webhookUrl, format);
      } catch (err) {
        return fail(err);
      }
      webhookEncrypted = encrypt(webhookUrl);
    } else if (existing?.webhookEncrypted) {
      webhookEncrypted = existing.webhookEncrypted;
    } else {
      return { ok: false, error: t("webhookRequired") };
    }
  }

  const data = {
    ...rest,
    scopeId,
    conditions: JSON.stringify(conditions),
    actions: JSON.stringify(actions),
    // Sem a ação "notificar", a URL (que pode conter token) não fica guardada.
    webhookEncrypted,
    webhookFormat: notify ? (webhookFormat ?? "json") : null,
  };
  const saved = existing
    ? await db.rule.update({ where: { id: existing.id }, data })
    : await db.rule.create({ data: { ...data, userId: user.id } });
  revalidatePath("/settings/rules");
  return { ok: true, id: saved.id };
}

export async function setRuleEnabledAction(id: string, enabled: boolean) {
  const user = await requireUser();
  await db.rule.updateMany({ where: { id, userId: user.id }, data: { enabled: Boolean(enabled) } });
  revalidatePath("/settings/rules");
  return { ok: true as const };
}

export async function deleteRuleAction(id: string) {
  const user = await requireUser();
  await db.rule.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/settings/rules");
  return { ok: true as const };
}

const PREVIEW_DAYS = 7;
const PREVIEW_MAX = 2000;
const APPLY_MAX = 5000;

/** Artigos do usuário no escopo, com a nota da IA dele, prontos para avaliar. */
async function candidates(userId: string, scope: { scope: string; scopeId: string | null }, opts: { since?: Date; take: number }) {
  const [articles, subscriptions] = await Promise.all([
    db.article.findMany({
      where: {
        feed: { subscriptions: { some: { userId } } },
        ...(scope.scope === "feed" && scope.scopeId ? { feedId: scope.scopeId } : {}),
        ...(opts.since ? { publishedAt: { gte: opts.since } } : {}),
      },
      select: {
        id: true,
        feedId: true,
        title: true,
        url: true,
        author: true,
        contentHtml: true,
        snippet: true,
        publishedAt: true,
        feed: { select: { title: true } },
        states: { where: { userId }, select: { priorityScore: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: opts.take,
    }),
    db.subscription.findMany({ where: { userId }, select: { feedId: true, folderId: true } }),
  ]);
  const subOf = new Map(subscriptions.map((s) => [s.feedId, s]));
  return articles
    .filter((a) => inScope(scope, a.feedId, subOf.get(a.feedId)))
    .map((a) => ({ article: a, candidate: toRuleArticle({ ...a, score: a.states[0]?.priorityScore ?? null }) }));
}

/** "Testar": quais artigos dos últimos 7 dias a regra pegaria (nada é gravado). */
export async function previewRuleAction(input: RuleDraft) {
  const user = await requireUser();
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const { scope, scopeId, matchAll, conditions } = parsed.data;
  const test = compileRule({ matchAll, conditions });
  const since = new Date(Date.now() - PREVIEW_DAYS * 86400000);
  const pool = await candidates(user.id, { scope, scopeId: scopeId ?? null }, { since, take: PREVIEW_MAX });
  const matches = pool.filter(({ candidate }) => test(candidate));
  return {
    ok: true as const,
    total: pool.length,
    count: matches.length,
    sample: matches.slice(0, 15).map(({ article }) => ({
      id: article.id,
      title: article.title,
      feed: article.feed.title,
      publishedAt: article.publishedAt,
      score: article.states[0]?.priorityScore ?? null,
    })),
  };
}

/** Aplica uma regra salva aos artigos que já existem (sem notificar). */
export async function applyRuleToExistingAction(id: string) {
  const user = await requireUser();
  const t = await errors();
  const rule = await ownedRule(user.id, id);
  const entry = rule ? compile(rule) : null;
  if (!rule || !entry) return { ok: false as const, error: t("ruleNotFound") };
  const actions = entry.actions.filter((a): a is Exclude<RuleAction, "notify"> => a !== "notify");
  if (actions.length === 0) return { ok: true as const, count: 0 };

  const pool = await candidates(user.id, rule, { take: APPLY_MAX });
  const byArticle = new Map<string, Set<RuleAction>>();
  for (const { article, candidate } of pool) if (entry.test(candidate)) byArticle.set(article.id, new Set(actions));
  await writeActions(user.id, byArticle);
  if (byArticle.size > 0) {
    await db.rule.update({ where: { id }, data: { hitCount: { increment: byArticle.size }, lastHitAt: new Date() } });
  }
  revalidatePath("/", "layout");
  return { ok: true as const, count: byArticle.size };
}

/** Envia uma notificação de exemplo para o webhook informado (ou o salvo na regra). */
export async function testWebhookAction(input: { ruleId?: string; webhookUrl?: string; webhookFormat: string }) {
  const user = await requireUser();
  const t = await errors();
  const format = z.enum(WEBHOOK_FORMATS).safeParse(input.webhookFormat);
  if (!format.success) return { ok: false as const, error: t("webhookInvalid") };

  let url = input.webhookUrl?.trim();
  if (!url && input.ruleId) {
    const rule = await ownedRule(user.id, input.ruleId);
    url = rule?.webhookEncrypted ? decrypt(rule.webhookEncrypted) : undefined;
  }
  if (!url) return { ok: false as const, error: t("webhookRequired") };
  if (!z.url().safeParse(url).success) return { ok: false as const, error: t("webhookInvalid") };
  const labels = await getTranslations("rules");
  try {
    await sendWebhook(url, format.data, {
      rule: labels("testRuleName"),
      article: { id: "test", title: labels("testArticleTitle"), url: "https://github.com/paulocarinhena/openRSS", feed: "openRSS", score: 90 },
    });
    return { ok: true as const };
  } catch (err) {
    return fail(err);
  }
}
