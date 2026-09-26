import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { firstUrlIn, normalizeLinkUrl } from "@/lib/feeds/saved-links";
import { Card } from "@/components/ui/input";
import { SaveLinkForm } from "@/components/save-link";

type Search = { url?: string; text?: string; title?: string };

export async function generateMetadata() {
  const t = await getTranslations("links");
  return { title: t("title") };
}

/**
 * Destino do bookmarklet e do menu Compartilhar do celular (share_target do manifest).
 * Não salva sozinho ao abrir: um GET com efeito colateral poderia ser disparado por outro site.
 */
export default async function SavePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireUser();
  const params = await searchParams;
  const t = await getTranslations("links");
  const url = (params.url && normalizeLinkUrl(params.url)) || firstUrlIn(params.text) || firstUrlIn(params.title) || "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Card>
          <SaveLinkForm initialUrl={url} autoFocus={!url} />
        </Card>
      </div>
    </div>
  );
}
