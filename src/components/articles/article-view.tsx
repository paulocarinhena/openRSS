import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getUserSettings } from "@/lib/app-settings";
import { getArticle, listArticles, scopeTitle, type ArticleScope } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { ArticleWorkspace } from "./article-workspace";
import { normalizeListView } from "@/lib/list-view";

type Search = { unread?: string; q?: string; a?: string };

/** Página de listagem genérica (Hoje, Todos, Salvos, Feed, Pasta). */
export async function ArticleView({ scope, searchParams }: { scope: ArticleScope; searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const t = await getTranslations("articles.scopes");
  const title = await scopeTitle(user.id, scope, { today: t("today"), all: t("all"), saved: t("saved") });
  if (!title) notFound();

  const unreadOnly = scope.kind === "saved" ? params.unread === "1" : params.unread !== "0";
  const query = params.q?.trim() || undefined;

  const [initial, settings, selected, providers, feed] = await Promise.all([
    listArticles(user.id, scope, { unreadOnly, query }),
    getUserSettings(user.id),
    params.a ? getArticle(user.id, params.a) : null,
    db.aiProvider.count({ where: { enabled: true, OR: [{ userId: user.id }, { userId: null }] } }),
    scope.kind === "feed" ? db.feed.findUnique({ where: { id: scope.feedId }, select: { lastError: true, errorCount: true, siteUrl: true } }) : null,
  ]);

  return (
    <ArticleWorkspace
      key={`${JSON.stringify(scope)}|${unreadOnly}|${query ?? ""}`}
      scope={scope}
      title={title}
      initial={initial}
      unreadOnly={unreadOnly}
      query={query}
      initialArticle={selected}
      listView={normalizeListView(settings.listView)}
      timezone={settings.timezone}
      aiEnabled={providers > 0}
      feedError={feed && feed.errorCount > 0 ? feed.lastError : null}
    />
  );
}
