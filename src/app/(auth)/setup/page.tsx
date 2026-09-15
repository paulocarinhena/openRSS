import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isSetupRequired } from "@/lib/env";
import { SetupWizard } from "./setup-wizard";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("setup") };
}
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (!isSetupRequired()) redirect("/");
  return <SetupWizard />;
}
