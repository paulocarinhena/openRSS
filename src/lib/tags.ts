import "server-only";
import { db } from "@/lib/db";

/** Tags do usuário com a quantidade de artigos salvos em cada uma. */
export async function listTags(userId: string) {
  const tags = await db.tag.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { articles: { where: { article: { states: { some: { userId, isSaved: true } } } } } } } },
  });
  return tags.map((t) => ({ id: t.id, name: t.name, count: t._count.articles }));
}
