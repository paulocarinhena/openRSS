import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getArticle } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { StandaloneReader } from "./standalone-reader";

export default async function ArticlePage({ params }: PageProps<"/article/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const article = await getArticle(user.id, id);
  if (!article) notFound();

  if (!article.state?.isRead) {
    await db.userArticle.upsert({
      where: { userId_articleId: { userId: user.id, articleId: id } },
      create: { userId: user.id, articleId: id, isRead: true, readAt: new Date() },
      update: { isRead: true, readAt: new Date() },
    });
  }
  const [providers, ttsProviders] = await Promise.all([
    db.aiProvider.count({ where: { enabled: true, OR: [{ userId: user.id }, { userId: null }] } }),
    db.ttsProvider.count({ where: { enabled: true, OR: [{ userId: user.id }, { userId: null }] } }),
  ]);

  return <StandaloneReader article={{ ...article, state: article.state ? { ...article.state, isRead: true } : null }} aiEnabled={providers > 0} ttsEnabled={ttsProviders > 0} />;
}
