import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getUserSettings } from "@/lib/app-settings";
import { decrypt } from "@/lib/crypto";
import { parseActions, parseConditions, type RuleCondition } from "@/lib/rules/engine";
import { RulesManager, type RuleView } from "./rules-manager";

type Search = { new?: string; feedId?: string; author?: string; keyword?: string };

/** Mostra só o host do webhook: o caminho costuma carregar o token. */
function maskWebhook(encrypted: string | null) {
  if (!encrypted) return null;
  try {
    return `${new URL(decrypt(encrypted)).host}/…`;
  } catch {
    return "…";
  }
}

export default async function RulesSettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const [rules, subscriptions, folders, settings, providers] = await Promise.all([
    db.rule.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    db.subscription.findMany({ where: { userId: user.id }, select: { feedId: true, customTitle: true, feed: { select: { title: true } } } }),
    db.folder.findMany({ where: { userId: user.id }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    getUserSettings(user.id),
    db.aiProvider.count({ where: { enabled: true, OR: [{ userId: user.id }, { userId: null }] } }),
  ]);

  const views: RuleView[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    scope: r.scope as RuleView["scope"],
    scopeId: r.scopeId,
    matchAll: r.matchAll,
    conditions: parseConditions(r.conditions),
    actions: parseActions(r.actions),
    webhookFormat: (r.webhookFormat ?? "json") as RuleView["webhookFormat"],
    webhookMasked: maskWebhook(r.webhookEncrypted),
    hitCount: r.hitCount,
    lastHitAt: r.lastHitAt,
  }));

  // "Criar regra a partir deste artigo": o leitor manda feed, autor e uma palavra-chave.
  const prefillConditions: RuleCondition[] = [
    ...(params.keyword?.trim() ? [{ field: "title" as const, op: "contains" as const, value: params.keyword.trim().slice(0, 200) }] : []),
    ...(params.author?.trim() ? [{ field: "author" as const, op: "equals" as const, value: params.author.trim().slice(0, 200) }] : []),
  ];
  const prefillFeed = params.feedId && subscriptions.some((s) => s.feedId === params.feedId) ? params.feedId : null;

  return (
    <RulesManager
      rules={views}
      feeds={subscriptions
        .map((s) => ({ id: s.feedId, title: s.customTitle ?? s.feed.title }))
        .sort((a, b) => a.title.localeCompare(b.title))}
      folders={folders}
      aiReady={providers > 0 && settings.classifyEnabled && Boolean(settings.interests?.trim())}
      prefill={params.new ? { scope: prefillFeed ? "feed" : "all", scopeId: prefillFeed, conditions: prefillConditions } : null}
    />
  );
}
