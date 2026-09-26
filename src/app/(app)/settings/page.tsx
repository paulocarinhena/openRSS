import { getUserSettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { OIDC_PROVIDER_ID, publicOidcInfo } from "@/lib/oidc";
import { GeneralForm } from "./general-form";
import { normalizeListView } from "@/lib/list-view";

export default async function GeneralSettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const oidc = publicOidcInfo();
  const linked = oidc ? (await db.account.count({ where: { userId: user.id, providerId: OIDC_PROVIDER_ID } })) > 0 : false;
  return (
    <GeneralForm
      name={user.name}
      email={user.email}
      language={settings.language}
      uiLanguage={settings.uiLanguage}
      timezone={settings.timezone}
      listView={normalizeListView(settings.listView)}
      groupStories={settings.groupStories}
      sso={oidc ? { name: oidc.name, linked } : null}
      timezones={Intl.supportedValuesOf("timeZone")}
    />
  );
}
