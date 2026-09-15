import { getTranslations } from "next-intl/server";
import { ArticleView } from "@/components/articles/article-view";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("today") };
}

export default function TodayPage({ searchParams }: PageProps<"/">) {
  return <ArticleView scope={{ kind: "today" }} searchParams={searchParams} />;
}
