import { ArticleView } from "@/components/articles/article-view";

export default async function FolderPage({ params, searchParams }: PageProps<"/folder/[id]">) {
  const { id } = await params;
  return <ArticleView scope={{ kind: "folder", folderId: id }} searchParams={searchParams} />;
}
