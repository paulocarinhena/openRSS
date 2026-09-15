import { getTranslations } from "next-intl/server";
import { ArticleView } from "@/components/articles/article-view";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("all") };
}

export default function AllPage({ searchParams }: PageProps<"/all">) {
  return <ArticleView scope={{ kind: "all" }} searchParams={searchParams} />;
}
