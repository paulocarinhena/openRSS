import { db } from "@/lib/db";
import { getApiUser } from "@/lib/session";
import { buildOpml } from "@/lib/feeds/opml";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const subs = await db.subscription.findMany({
    where: { userId: user.id },
    include: { feed: true, folder: true },
    orderBy: { createdAt: "asc" },
  });
  const xml = buildOpml(
    `openRSS — ${user.name}`,
    subs.map((s) => ({ url: s.feed.url, title: s.customTitle ?? s.feed.title, siteUrl: s.feed.siteUrl, folder: s.folder?.name ?? null })),
  );
  return new Response(xml, {
    headers: {
      "content-type": "text/x-opml; charset=utf-8",
      "content-disposition": `attachment; filename="openrss-${new Date().toISOString().slice(0, 10)}.opml"`,
    },
  });
}
