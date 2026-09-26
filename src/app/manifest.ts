import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations("metadata");
  return {
    name: t("appName"),
    short_name: t("appName"),
    description: t("description"),
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7fafe",
    theme_color: "#1b3f63",
    categories: ["news", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Menu "Compartilhar" do celular: manda o link para /save.
    share_target: { action: "/save", method: "GET", params: { title: "title", text: "text", url: "url" } },
    shortcuts: [
      { name: t("today"), url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: t("saved"), url: "/saved", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: t("digest"), url: "/digest", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
