import { ArticleView } from "@/components/articles/article-view";

export const metadata = { title: "Todos" };

export default function AllPage({ searchParams }: PageProps<"/all">) {
  return <ArticleView scope={{ kind: "all" }} searchParams={searchParams} />;
}
