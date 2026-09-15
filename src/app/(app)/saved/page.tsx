import { getTranslations } from "next-intl/server";
import { ArticleView } from "@/components/articles/article-view";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("saved") };
}

export default function SavedPage({ searchParams }: PageProps<"/saved">) {
  return <ArticleView scope={{ kind: "saved" }} searchParams={searchParams} />;
}
