import { getUserSettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/session";
import { GeneralForm } from "./general-form";
import { normalizeListView } from "@/lib/list-view";

export default async function GeneralSettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  return (
    <GeneralForm
      name={user.name}
      email={user.email}
      language={settings.language}
      uiLanguage={settings.uiLanguage}
      timezone={settings.timezone}
      listView={normalizeListView(settings.listView)}
      timezones={Intl.supportedValuesOf("timeZone")}
    />
  );
}
