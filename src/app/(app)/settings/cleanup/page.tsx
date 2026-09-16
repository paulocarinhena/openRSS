import { getAppSettings } from "@/lib/app-settings";
import { requireAdmin } from "@/lib/session";
import { CleanupSettings } from "./cleanup-settings";

export default async function CleanupSettingsPage() {
  await requireAdmin();
  const settings = await getAppSettings();
  return <CleanupSettings retentionDays={settings.retentionDays} />;
}
