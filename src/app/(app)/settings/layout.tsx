import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { SettingsTabs } from "./tabs";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return { title: t("settings") };
}

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = await getTranslations("settings");
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight dark:font-normal">{t("title")}</h1>
        <SettingsTabs isAdmin={user.role === "admin"} />
        {children}
      </div>
    </div>
  );
}
