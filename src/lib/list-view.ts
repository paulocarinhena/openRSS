/** Modos de visualização da lista de artigos (módulo comum: usado no servidor e no cliente). */
export type ListView = "cards" | "grid" | "titles";

/** Converte valores antigos salvos ("magazine") para os modos atuais. */
export function normalizeListView(value: string | null | undefined): ListView {
  if (value === "grid" || value === "titles" || value === "cards") return value;
  if (value === "magazine") return "grid";
  return "cards";
}
