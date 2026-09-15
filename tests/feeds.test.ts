import { describe, expect, it } from "vitest";
import { looksLikeFeed, parseFeed } from "@/lib/feeds/parse";
import { buildOpml, parseOpml } from "@/lib/feeds/opml";
import { sanitizeArticleHtml } from "@/lib/feeds/sanitize";

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Blog Exemplo</title>
    <link>https://exemplo.com/</link>
    <description>Um blog</description>
    <item>
      <title>Primeiro post</title>
      <link>/posts/1</link>
      <guid>post-1</guid>
      <pubDate>Mon, 14 Sep 2026 10:00:00 GMT</pubDate>
      <content:encoded><![CDATA[<p>Olá <a href="/x">link</a></p><script>alert(1)</script><img src="/img.png">]]></content:encoded>
    </item>
    <item>
      <title>Sem guid</title>
      <link>https://exemplo.com/posts/2</link>
      <description>Texto simples</description>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<link href="https://atom.test/"/><entry><id>tag:1</id><title>A1</title><link href="https://atom.test/1"/><updated>2026-09-01T00:00:00Z</updated><content type="html">&lt;b&gt;oi&lt;/b&gt;</content></entry></feed>`;

describe("parseFeed", () => {
  it("detecta feeds", () => {
    expect(looksLikeFeed(rss)).toBe(true);
    expect(looksLikeFeed(atom)).toBe(true);
    expect(looksLikeFeed("<!doctype html><html></html>")).toBe(false);
  });

  it("normaliza itens RSS com URLs absolutas e HTML sanitizado", async () => {
    const feed = await parseFeed(rss, "https://exemplo.com/feed.xml");
    expect(feed.title).toBe("Blog Exemplo");
    expect(feed.items).toHaveLength(2);

    const [first, second] = feed.items;
    expect(first.guid).toBe("post-1");
    expect(first.url).toBe("https://exemplo.com/posts/1");
    expect(first.contentHtml).not.toContain("<script");
    expect(first.contentHtml).toContain('href="https://exemplo.com/x"');
    expect(first.imageUrl).toBe("https://exemplo.com/img.png");
    expect(first.publishedAt.toISOString()).toBe("2026-09-14T10:00:00.000Z");

    expect(second.guid).toBe("https://exemplo.com/posts/2");
    expect(second.snippet).toBe("Texto simples");
  });

  it("lê Atom", async () => {
    const feed = await parseFeed(atom, "https://atom.test/feed");
    expect(feed.items[0]).toMatchObject({ guid: "tag:1", title: "A1", url: "https://atom.test/1" });
  });
});

describe("sanitizeArticleHtml", () => {
  it("remove handlers e iframes não permitidos", () => {
    const html = sanitizeArticleHtml('<p onclick="x()">a</p><iframe src="https://evil.test/"></iframe><iframe src="https://www.youtube.com/embed/1"></iframe>');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("evil.test");
    expect(html).toContain("youtube.com/embed/1");
  });
});

describe("OPML", () => {
  it("faz ida e volta com pastas", () => {
    const xml = buildOpml("teste", [
      { url: "https://a.test/feed", title: "A & B", siteUrl: "https://a.test", folder: "Tech" },
      { url: "https://c.test/rss", title: "C", siteUrl: null, folder: null },
    ]);
    expect(parseOpml(xml)).toEqual([
      { url: "https://a.test/feed", title: "A & B", folder: "Tech" },
      { url: "https://c.test/rss", title: "C", folder: null },
    ]);
  });
});
