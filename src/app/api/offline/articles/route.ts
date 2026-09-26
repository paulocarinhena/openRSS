import { db } from "@/lib/db";
import { getApiUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_SAVED = 100;
const MAX_RECENT = 20;

/** Artigos que o service worker guarda para leitura offline: os salvos e os lidos recentemente. */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const select = { articleId: true, article: { select: { title: true, feed: { select: { title: true } } } } } as const;
  const [saved, recent] = await Promise.all([
    db.userArticle.findMany({ where: { userId: user.id, isSaved: true }, orderBy: { savedAt: "desc" }, take: MAX_SAVED, select }),
    db.userArticle.findMany({
      where: { userId: user.id, isRead: true, readAt: { not: null }, article: { feed: { subscriptions: { some: { userId: user.id } } } } },
      orderBy: { readAt: "desc" },
      take: MAX_RECENT,
      select,
    }),
  ]);

  const byId = new Map<string, { id: string; title: string; feed: string; saved: boolean }>();
  for (const [rows, isSaved] of [[saved, true], [recent, false]] as const) {
    for (const s of rows) {
      if (!byId.has(s.articleId)) byId.set(s.articleId, { id: s.articleId, title: s.article.title, feed: s.article.feed.title, saved: isSaved });
    }
  }
  const articles = [...byId.values()];

  return Response.json({ articles }, { headers: { "cache-control": "private, no-store" } });
}
