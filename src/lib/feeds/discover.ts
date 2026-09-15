import "server-only";
import { parseHTML } from "linkedom";
import { safeFetch } from "./net";
import { looksLikeFeed, parseFeed, type ParsedFeed } from "./parse";

export type DiscoveredFeed = { url: string; title: string; siteUrl: string | null; itemCount: number; feed: ParsedFeed };

const COMMON_PATHS = ["/feed", "/rss", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml", "/feed/"];

function normalizeInput(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function tryFeed(url: string): Promise<DiscoveredFeed | null> {
  try {
    const res = await safeFetch(url);
    if (!looksLikeFeed(res.body)) return null;
    const feed = await parseFeed(res.body, res.url);
    return { url: res.url, title: feed.title, siteUrl: feed.siteUrl, itemCount: feed.items.length, feed };
  } catch {
    return null;
  }
}

/** Aceita URL de feed ou de site e retorna os feeds encontrados. */
export async function discoverFeeds(input: string): Promise<DiscoveredFeed[]> {
  const url = normalizeInput(input);
  const res = await safeFetch(url);

  if (looksLikeFeed(res.body)) {
    const feed = await parseFeed(res.body, res.url);
    return [{ url: res.url, title: feed.title, siteUrl: feed.siteUrl, itemCount: feed.items.length, feed }];
  }

  const { document } = parseHTML(res.body);
  const candidates = new Set<string>();
  for (const link of document.querySelectorAll('link[rel~="alternate"]')) {
    const type = link.getAttribute("type") ?? "";
    const href = link.getAttribute("href");
    if (href && /(rss|atom|feed)\+xml|application\/(rss|atom|feed)/i.test(type)) {
      candidates.add(new URL(href, res.url).toString());
    }
  }
  if (candidates.size === 0) {
    for (const path of COMMON_PATHS) candidates.add(new URL(path, res.url).toString());
  }

  const results = await Promise.all([...candidates].slice(0, 8).map(tryFeed));
  const seen = new Set<string>();
  return results.filter((r): r is DiscoveredFeed => {
    if (!r || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}
