"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Database, HardDrive, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { completeSetup, testPostgresConnection, type PostgresInput } from "@/app/actions/setup";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Label, Switch } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Provider = "sqlite" | "postgresql";
type Step = "choose" | "postgres" | "confirm-create" | "installing";

// Descrições em messages/*.json (setup.providers.<id>).
const PROVIDERS: { id: Provider; title: string; icon: typeof Database }[] = [
  { id: "sqlite", title: "SQLite", icon: HardDrive },
  { id: "postgresql", title: "PostgreSQL", icon: Database },
];

const DEFAULT_PG: PostgresInput = { host: "localhost", port: 5432, user: "openrss", password: "", database: "openrss", ssl: false };

export function SetupWizard() {
  const t = useTranslations("setup");
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [provider, setProvider] = useState<Provider>("sqlite");
  const [pg, setPg] = useState<PostgresInput>(DEFAULT_PG);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function install(createDatabase = false) {
    setError(null);
    setPending(true);
    setStep("installing");
    try {
      const result = await completeSetup(
        provider === "sqlite" ? { provider: "sqlite" } : { provider: "postgresql", createDatabase, ...pg },
      );
      if (result.status === "error") {
        setError(result.message);
        setStep(provider === "sqlite" ? "choose" : "postgres");
        return;
      }
      // O proxy leva para /login, que redireciona ao cadastro do primeiro admin.
      router.replace("/");
      router.refresh();
    } catch {
      setError(t("errors.network"));
      setStep(provider === "sqlite" ? "choose" : "postgres");
    } finally {
      setPending(false);
    }
  }

  function onChoose() {
    setError(null);
    if (provider === "sqlite") void install();
    else setStep("postgres");
  }

  async function onConnect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await testPostgresConnection(pg);
      if (result.status === "error") setError(result.message);
      else if (result.status === "missing-database") setStep("confirm-create");
      else await install();
    } catch {
      setError(t("errors.network"));
    } finally {
      setPending(false);
    }
  }

  const field = (key: keyof PostgresInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPg((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h1 className="text-base font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t(`steps.${step}`)}</p>
      </div>

      {step === "choose" && (
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label={t("database")} className="flex flex-col gap-2">
            {PROVIDERS.map(({ id, title, icon: Icon }) => {
              const selected = provider === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setProvider(id)}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-control border p-3 text-left transition-colors duration-200",
                    selected ? "border-primary bg-accent" : "border-border hover:bg-accent",
                  )}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{title}</span>
                    <span className="text-xs text-muted-foreground">{t(`providers.${id}`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {error && <p role="alert" aria-live="assertive" className="text-xs text-destructive">{error}</p>}
          <Button type="button" variant="primary" size="lg" onClick={onChoose} disabled={pending}>
            {t("continue")}
          </Button>
        </div>
      )}

      {step === "postgres" && (
        <form onSubmit={onConnect} className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_5.5rem] gap-3">
            <Field label={t("host")}>
              <Input name="host" value={pg.host} onChange={field("host")} required autoFocus />
            </Field>
            <Field label={t("port")}>
              <Input name="port" type="number" min={1} max={65535} value={pg.port} onChange={field("port")} required />
            </Field>
          </div>
          <Field label={t("user")}>
            <Input name="user" value={pg.user} onChange={field("user")} required autoComplete="username" />
          </Field>
          <Field label={t("password")}>
            <Input name="password" type="password" value={pg.password} onChange={field("password")} autoComplete="current-password" />
          </Field>
          <Field label={t("database")} hint={t("databaseHint")}>
            <Input name="database" value={pg.database} onChange={field("database")} required pattern="[A-Za-z0-9_]+" />
          </Field>
          <div className="flex items-center justify-between">
            <Label htmlFor="pg-ssl">{t("useSsl")}</Label>
            <Switch id="pg-ssl" checked={Boolean(pg.ssl)} onCheckedChange={(ssl) => setPg((prev) => ({ ...prev, ssl }))} />
          </div>
          {error && <p role="alert" aria-live="assertive" className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="lg" onClick={() => { setError(null); setStep("choose"); }} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={pending}>
              {pending ? t("connecting") : t("connect")}
            </Button>
          </div>
        </form>
      )}

      {step === "confirm-create" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {t.rich("confirmCreate", {
              database: pg.database,
              host: `${pg.host}:${pg.port}`,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.rich("createDbPermission", {
              user: pg.user,
              strong: (chunks) => <strong>{chunks}</strong>,
              code: (chunks) => <code>{chunks}</code>,
            })}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="lg" onClick={() => setStep("postgres")} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="primary" size="lg" className="flex-1" onClick={() => install(true)} disabled={pending}>
              {t("createAndContinue")}
            </Button>
          </div>
        </div>
      )}

      {step === "installing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="size-4 animate-spin" />
          {provider === "sqlite" ? t("installingSqlite") : t("installingPostgres")}
        </div>
      )}
    </Card>
  );
}
