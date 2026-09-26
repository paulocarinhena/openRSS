import "server-only";
import { pinnedFetch, resolveNetworkTarget } from "@/lib/network";
import { LocalizedError } from "@/lib/localized-error";
import type { WebhookFormat } from "./engine";

export type WebhookPayload = {
  rule: string;
  article: { id: string; title: string; url: string | null; feed: string; score: number | null };
};

/** Destinos na rede local (ex.: ntfy em casa) só com ALLOW_PRIVATE_WEBHOOKS=true. */
const allowPrivate = () => process.env.ALLOW_PRIVATE_WEBHOOKS === "true";

/** Link do artigo no openRSS quando a URL pública é conhecida; senão, o original. */
function articleLink(article: WebhookPayload["article"]) {
  const base = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
  return base ? `${base}/article/${article.id}` : (article.url ?? "");
}

/** Monta a requisição de cada serviço. A URL informada pelo usuário é sempre o destino (ou a base dele). */
export function buildWebhookRequest(webhookUrl: string, format: WebhookFormat, payload: WebhookPayload) {
  const url = new URL(webhookUrl);
  const { article, rule } = payload;
  const link = articleLink(article);
  const line = `${article.title} — ${article.feed}${article.score !== null ? ` (${article.score})` : ""}`;

  switch (format) {
    case "ntfy": {
      // https://ntfy.sh/<tópico>: publica em JSON na raiz do servidor (aceita UTF-8 no título).
      const topic = url.pathname.replace(/^\/+|\/+$/g, "");
      if (!topic || topic.includes("/")) throw new LocalizedError("webhookInvalid");
      return {
        url: new URL("/", url).toString(),
        body: { topic, title: `openRSS · ${rule}`, message: line, ...(link ? { click: link } : {}), tags: ["newspaper"] },
      };
    }
    case "discord":
      return { url: url.toString(), body: { username: "openRSS", content: `**${rule}** · ${link ? `[${article.title}](<${link}>)` : article.title} — ${article.feed}` } };
    case "slack":
      return { url: url.toString(), body: { text: `*${rule}* · ${link ? `<${link}|${article.title}>` : article.title} — ${article.feed}` } };
    case "telegram": {
      // https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>
      const chatId = url.searchParams.get("chat_id");
      if (!chatId) throw new LocalizedError("webhookInvalid");
      url.search = "";
      return { url: url.toString(), body: { chat_id: chatId, text: `${rule}\n${line}${link ? `\n${link}` : ""}` } };
    }
    default:
      return { url: url.toString(), body: { event: "rule.matched", rule, article: { ...article, link } } };
  }
}

/** Valida o destino ao salvar a regra (formato e rede), sem enviar nada. */
export async function assertWebhookUrl(webhookUrl: string, format: WebhookFormat) {
  const { url } = buildWebhookRequest(webhookUrl, format, {
    rule: "",
    article: { id: "", title: "", url: null, feed: "", score: null },
  });
  await resolveNetworkTarget(url, allowPrivate());
}

export async function sendWebhook(webhookUrl: string, format: WebhookFormat, payload: WebhookPayload) {
  const request = buildWebhookRequest(webhookUrl, format, payload);
  const connection = await pinnedFetch(
    request.url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request.body),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    },
    allowPrivate(),
  );
  try {
    const res = connection.response;
    await res.body?.cancel();
    if (!res.ok) throw new LocalizedError("httpStatus", { status: res.status });
  } finally {
    await connection.close();
  }
}
