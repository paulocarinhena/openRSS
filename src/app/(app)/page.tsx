import { ArticleView } from "@/components/articles/article-view";

export const metadata = { title: "Hoje" };

export default function TodayPage({ searchParams }: PageProps<"/">) {
  return <ArticleView scope={{ kind: "today" }} searchParams={searchParams} />;
}
