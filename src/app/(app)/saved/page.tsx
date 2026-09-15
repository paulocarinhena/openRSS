import { ArticleView } from "@/components/articles/article-view";

export const metadata = { title: "Salvos" };

export default function SavedPage({ searchParams }: PageProps<"/saved">) {
  return <ArticleView scope={{ kind: "saved" }} searchParams={searchParams} />;
}
