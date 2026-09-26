"use client";

import { ShieldCheck, Trash2, User as UserIcon, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createUserAction, deleteUserAction, setUserRoleAction, updateAppSettingsAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Card, Field, Input, Switch } from "@/components/ui/input";

type User = { id: string; name: string; email: string; role: string; createdAt: Date; subscriptions: number };

export function AdminPanel({
  currentUserId,
  settings: initial,
  users,
  stats,
  passwordLoginDisabled = false,
}: {
  currentUserId: string;
  /** Com OIDC_DISABLE_PASSWORD_LOGIN não há como criar contas com senha. */
  passwordLoginDisabled?: boolean;
  settings: { allowRegistration: boolean; refreshIntervalMinutes: number };
  users: User[];
  stats: { feeds: number; articles: number; failingFeeds: number; database: string };
}) {
  const t = useTranslations("admin");
  const [settings, setSettings] = useState(initial);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "user" as "user" | "admin" });
  const [pending, start] = useTransition();

  const roleOptions: ComboboxOption[] = [
    { value: "user", label: t("roleUser"), icon: <UserIcon /> },
    { value: "admin", label: t("roleAdmin"), description: t("roleAdminHint"), icon: <ShieldCheck /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("stats.database"), stats.database],
          [t("stats.feeds"), stats.feeds],
          [t("stats.articles"), stats.articles],
          [t("stats.failingFeeds"), stats.failingFeeds],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="eyebrow">{label}</p>
            <p className="mt-1 font-mono text-lg">{value}</p>
          </Card>
        ))}
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await updateAppSettingsAction(settings);
            if (res.ok) toast.success(t("saved"));
            else toast.error(res.error);
          });
        }}
      >
        <h2 className="eyebrow">{t("instance")}</h2>
        <Card className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 sm:col-span-2">
            <span>
              <span className="block font-medium">{t("openRegistration")}</span>
              <span className="text-xs text-muted-foreground">{t("openRegistrationHint")}</span>
            </span>
            <Switch checked={settings.allowRegistration} onCheckedChange={(v) => setSettings({ ...settings, allowRegistration: v })} />
          </label>
          <Field label={t("refreshInterval")}>
            <Input
              type="number"
              min={5}
              max={1440}
              value={settings.refreshIntervalMinutes}
              onChange={(e) => setSettings({ ...settings, refreshIntervalMinutes: Number(e.target.value) })}
            />
          </Field>
        </Card>
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">{t("users", { count: users.length })}</h2>
        <Card className="divide-y divide-border p-0">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {u.email} · {t("feedCount", { count: u.subscriptions })}
                </p>
              </div>
              <Combobox
                size="sm"
                className="w-36"
                aria-label={t("role")}
                value={u.role}
                disabled={u.id === currentUserId || pending}
                options={roleOptions}
                onValueChange={(role) =>
                  start(async () => {
                    const res = await setUserRoleAction(u.id, role as "user" | "admin");
                    if (!res.ok) toast.error(res.error);
                  })
                }
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("deleteUser")}
                disabled={u.id === currentUserId || pending}
                onClick={() => {
                  if (!window.confirm(t("deleteUserConfirm", { email: u.email }))) return;
                  start(async () => {
                    const res = await deleteUserAction(u.id);
                    if (!res.ok) toast.error(res.error);
                  });
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </Card>

        {passwordLoginDisabled ? (
          <Card className="text-xs text-muted-foreground">{t("passwordLoginDisabled")}</Card>
        ) : (
          <Card>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await createUserAction(newUser);
                  if (res.ok) {
                    toast.success(t("userCreated"));
                    setNewUser({ name: "", email: "", password: "", role: "user" });
                  } else toast.error(res.error);
                });
              }}
            >
              <Field label={t("name")}>
                <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
              </Field>
              <Field label={t("email")}>
                <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
              </Field>
              <Field label={t("initialPassword")}>
                <Input type="password" minLength={8} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
              </Field>
              <Field label={t("role")}>
                <Combobox
                  aria-label={t("role")}
                  value={newUser.role}
                  options={roleOptions}
                  onValueChange={(role) => setNewUser({ ...newUser, role: role as "user" | "admin" })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={pending}>
                  <UserPlus /> {t("createUser")}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </section>
    </div>
  );
}
