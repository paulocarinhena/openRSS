"use client";

import { ShieldCheck, Trash2, User as UserIcon, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createUserAction, deleteUserAction, setUserRoleAction, updateAppSettingsAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Card, Field, Input, Switch } from "@/components/ui/input";

const ROLE_OPTIONS: ComboboxOption[] = [
  { value: "user", label: "Usuário", icon: <UserIcon /> },
  { value: "admin", label: "Admin", description: "Gerencia usuários e provedores globais", icon: <ShieldCheck /> },
];

type User = { id: string; name: string; email: string; role: string; createdAt: Date; subscriptions: number };

export function AdminPanel({
  currentUserId,
  settings: initial,
  users,
  stats,
}: {
  currentUserId: string;
  settings: { allowRegistration: boolean; refreshIntervalMinutes: number; retentionDays: number };
  users: User[];
  stats: { feeds: number; articles: number; failingFeeds: number; database: string };
}) {
  const [settings, setSettings] = useState(initial);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "user" as "user" | "admin" });
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Banco", stats.database],
          ["Feeds", stats.feeds],
          ["Artigos", stats.articles],
          ["Feeds com erro", stats.failingFeeds],
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
            if (res.ok) toast.success("Configurações salvas");
            else toast.error(res.error);
          });
        }}
      >
        <h2 className="eyebrow">Instância</h2>
        <Card className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 sm:col-span-2">
            <span>
              <span className="block font-medium">Cadastro aberto</span>
              <span className="text-xs text-muted-foreground">Permite que qualquer pessoa crie uma conta pela tela de cadastro.</span>
            </span>
            <Switch checked={settings.allowRegistration} onCheckedChange={(v) => setSettings({ ...settings, allowRegistration: v })} />
          </label>
          <Field label="Intervalo de atualização (min)">
            <Input
              type="number"
              min={5}
              max={1440}
              value={settings.refreshIntervalMinutes}
              onChange={(e) => setSettings({ ...settings, refreshIntervalMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Retenção de artigos (dias)" hint="Artigos mais antigos são removidos, exceto os salvos.">
            <Input type="number" min={7} max={3650} value={settings.retentionDays} onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })} />
          </Field>
        </Card>
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            Salvar
          </Button>
        </div>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Usuários ({users.length})</h2>
        <Card className="divide-y divide-border p-0">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {u.email} · {u.subscriptions} feeds
                </p>
              </div>
              <Combobox
                size="sm"
                className="w-36"
                aria-label="Papel"
                value={u.role}
                disabled={u.id === currentUserId || pending}
                options={ROLE_OPTIONS}
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
                aria-label="Excluir usuário"
                disabled={u.id === currentUserId || pending}
                onClick={() => {
                  if (!window.confirm(`Excluir ${u.email} e todos os seus dados?`)) return;
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

        <Card>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await createUserAction(newUser);
                if (res.ok) {
                  toast.success("Usuário criado");
                  setNewUser({ name: "", email: "", password: "", role: "user" });
                } else toast.error(res.error);
              });
            }}
          >
            <Field label="Nome">
              <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
            </Field>
            <Field label="Email">
              <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
            </Field>
            <Field label="Senha inicial">
              <Input type="password" minLength={8} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
            </Field>
            <Field label="Papel">
              <Combobox
                aria-label="Papel"
                value={newUser.role}
                options={ROLE_OPTIONS}
                onValueChange={(role) => setNewUser({ ...newUser, role: role as "user" | "admin" })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                <UserPlus /> Criar usuário
              </Button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
