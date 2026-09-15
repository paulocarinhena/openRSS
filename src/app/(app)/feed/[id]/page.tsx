import { ArticleView } from "@/components/articles/article-view";

export default async function FeedPage({ params, searchParams }: PageProps<"/feed/[id]">) {
  const { id } = await params;
  return <ArticleView scope={{ kind: "feed", feedId: id }} searchParams={searchParams} />;
}
