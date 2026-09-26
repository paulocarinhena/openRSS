import { getTranslations } from "next-intl/server";
import { ArticleView } from "@/components/articles/article-view";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("saved") };
}

export default async function SavedPage({ searchParams }: PageProps<"/saved">) {
  const { tag } = await searchParams;
  const name = typeof tag === "string" ? tag.trim().slice(0, 40) : "";
  return <ArticleView scope={name ? { kind: "saved", tag: name } : { kind: "saved" }} searchParams={searchParams} />;
}
