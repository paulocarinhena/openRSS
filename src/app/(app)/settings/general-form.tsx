"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProfileAction, updateSettingsAction } from "@/app/actions/settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Card, Field, Input } from "@/components/ui/input";
import { LayoutGrid, List, Rows3 } from "lucide-react";

export function GeneralForm(props: {
  name: string;
  email: string;
  language: string;
  timezone: string;
  listView: string;
  timezones: string[];
}) {
  const [name, setName] = useState(props.name);
  const [language, setLanguage] = useState(props.language);
  const [timezone, setTimezone] = useState(props.timezone);
  const [listView, setListView] = useState(props.listView);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const [a, b] = await Promise.all([
        updateProfileAction(name),
        updateSettingsAction({ language, timezone, listView: listView as "cards" | "grid" | "titles" }),
      ]);
      const err = (!a.ok && a.error) || (!b.ok && b.error);
      if (err) toast.error(err);
      else toast.success("Configurações salvas");
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <Input value={props.email} disabled />
        </Field>
        <Field label="Idioma da IA" hint="Idioma usado em resumos, digest e chat.">
          <Combobox
            aria-label="Idioma da IA"
            value={language}
            onValueChange={setLanguage}
            options={[
              { value: "pt-BR", label: "Português (Brasil)" },
              { value: "en", label: "English" },
              { value: "es", label: "Español" },
            ]}
          />
        </Field>
        <Field label="Fuso horário">
          <Combobox
            aria-label="Fuso horário"
            value={timezone}
            onValueChange={setTimezone}
            searchPlaceholder="Buscar cidade ou região…"
            options={props.timezones.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
          />
        </Field>
        <Field label="Visualização da lista">
          <Combobox
            aria-label="Visualização da lista"
            value={listView}
            onValueChange={setListView}
            options={[
              { value: "cards", label: "Cartões", description: "Um por linha, com imagem e trecho da matéria", icon: <Rows3 /> },
              { value: "grid", label: "Grade", description: "Cards menores, vários na tela", icon: <LayoutGrid /> },
              { value: "titles", label: "Só texto", description: "Lista compacta de títulos", icon: <List /> },
            ]}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">Tema</span>
          <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
            <ThemeToggle /> Light · Dark · sistema
          </div>
        </div>
      </Card>
      <Card className="text-xs text-muted-foreground">
        <p className="eyebrow mb-2">Atalhos</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {[
            ["j / k", "próximo / anterior"],
            ["o", "abrir original"],
            ["m", "alternar lido"],
            ["s", "salvar"],
            ["Shift + A", "marcar tudo como lido"],
            ["/", "buscar"],
            ["Esc", "fechar leitor"],
          ].map(([k, v]) => (
            <li key={k}>
              <kbd className="rounded border border-border px-1 font-mono">{k}</kbd> {v}
            </li>
          ))}
        </ul>
      </Card>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
