import { db, getDbProvider } from "@/lib/db";
import { getAppSettings } from "@/lib/app-settings";
import { requireAdmin } from "@/lib/session";
import { publicOidcInfo } from "@/lib/oidc";
import { readSmtpConfig } from "@/lib/mail";
import { AdminPanel } from "./admin-panel";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [settings, users, stats] = await Promise.all([
    getAppSettings(),
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true, _count: { select: { subscriptions: true } } },
    }),
    Promise.all([db.feed.count(), db.article.count(), db.feed.count({ where: { errorCount: { gte: 3 } } })]),
  ]);

  return (
    <AdminPanel
      currentUserId={admin.id}
      settings={{ allowRegistration: settings.allowRegistration, refreshIntervalMinutes: settings.refreshIntervalMinutes }}
      users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt, subscriptions: u._count.subscriptions }))}
      passwordLoginDisabled={publicOidcInfo()?.passwordLoginDisabled ?? false}
      smtpHost={readSmtpConfig()?.host ?? null}
      stats={{ feeds: stats[0], articles: stats[1], failingFeeds: stats[2], database: getDbProvider() === "postgresql" ? "PostgreSQL" : "SQLite" }}
    />
  );
}
