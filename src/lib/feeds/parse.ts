import Parser from "rss-parser";
import { createHash } from "node:crypto";
import { stripHtml, truncate } from "@/lib/utils";
import { firstImage, sanitizeArticleHtml } from "./sanitize";

type MediaNode = { $?: { url?: string; medium?: string; type?: string } };
type OneOrMany<T> = T | T[];

type CustomItem = {
  "content:encoded"?: string;
  "media:content"?: OneOrMany<MediaNode>;
  "media:thumbnail"?: OneOrMany<MediaNode>;
  "media:group"?: OneOrMany<{ "media:thumbnail"?: OneOrMany<MediaNode>; "media:content"?: OneOrMany<MediaNode> }>;
  enclosure?: { url?: string; type?: string };
  id?: string;
};

const parser = new Parser<Record<string, unknown>, CustomItem>({
  customFields: {
    item: [
      ["content:encoded", "content:encoded"],
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"],
      ["media:group", "media:group"],
      ["id", "id"],
    ],
  },
});

const first = <T,>(value: OneOrMany<T> | undefined): T | undefined => (Array.isArray(value) ? value[0] : value);

/** URL de imagem em media:content (se for imagem) ou media:thumbnail. */
function mediaImage(content?: OneOrMany<MediaNode>, thumbnail?: OneOrMany<MediaNode>): string | undefined {
  const contents = Array.isArray(content) ? content : content ? [content] : [];
  const image = contents.find((c) => c.$?.url && (!c.$.medium || c.$.medium === "image") && !c.$.type?.startsWith("video/"));
  return image?.$?.url ?? first(thumbnail)?.$?.url;
}

export type ParsedArticle = {
  guid: string;
  url: string | null;
  title: string;
  author: string | null;
  contentHtml: string | null;
  snippet: string | null;
  imageUrl: string | null;
  publishedAt: Date;
};

export type ParsedFeed = {
  title: string;
  siteUrl: string | null;
  description: string | null;
  iconUrl: string | null;
  items: ParsedArticle[];
};

export function looksLikeFeed(body: string): boolean {
  const head = body.slice(0, 2000).trimStart();
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)\b/i.test(head);
}

export async function parseFeed(xml: string, feedUrl: string): Promise<ParsedFeed> {
  const feed = await parser.parseString(xml);
  const siteUrl = feed.link ? safeUrl(feed.link, feedUrl) : null;

  const items = feed.items.slice(0, 200).map((item): ParsedArticle => {
    const link = item.link ? safeUrl(item.link, siteUrl ?? feedUrl) : null;
    const rawHtml = item["content:encoded"] ?? item.content ?? item.summary ?? "";
    const contentHtml = rawHtml ? sanitizeArticleHtml(rawHtml, link ?? siteUrl ?? feedUrl) : null;
    const text = stripHtml(rawHtml || item.contentSnippet || "");
    const date = item.isoDate ?? item.pubDate;
    const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date) : new Date();
    const group = first(item["media:group"]);
    const imageUrl =
      mediaImage(item["media:content"], item["media:thumbnail"]) ??
      mediaImage(group?.["media:content"], group?.["media:thumbnail"]) ??
      (item.enclosure?.type?.startsWith("image/") ? item.enclosure.url : null) ??
      firstImage(contentHtml);

    return {
      guid: item.guid ?? item.id ?? link ?? createHash("sha1").update(`${item.title}|${date}`).digest("hex"),
      url: link,
      title: (item.title && stripHtml(item.title)) || truncate(text, 80) || "(sem título)",
      author: item.creator ?? (item as { author?: string }).author ?? null,
      contentHtml,
      snippet: text ? truncate(text, 280) : null,
      imageUrl: imageUrl ?? null,
      publishedAt: publishedAt > new Date(Date.now() + 86400000) ? new Date() : publishedAt,
    };
  });

  return {
    title: feed.title?.trim() || new URL(feedUrl).hostname,
    siteUrl,
    description: feed.description ?? null,
    iconUrl: (feed.image as { url?: string } | undefined)?.url ?? (siteUrl ? faviconFor(siteUrl) : null),
    items,
  };
}

export function faviconFor(siteUrl: string): string | null {
  try {
    return new URL("/favicon.ico", siteUrl).toString();
  } catch {
    return null;
  }
}

function safeUrl(value: string, base: string): string | null {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}
