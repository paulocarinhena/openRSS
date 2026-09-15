import { parseHTML } from "linkedom";

export type OpmlEntry = { url: string; title: string | null; folder: string | null };

export function parseOpml(xml: string): OpmlEntry[] {
  // linkedom não tem parser XML estrito; o parser HTML lida bem com <outline/>.
  // Tags auto-fechadas não existem em HTML: expande <outline .../> para não aninhar os irmãos.
  const html = xml.replace(/<\?xml[^>]*>/, "").replace(/<outline\b([^>]*?)\/>/gi, "<outline$1></outline>");
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const entries: OpmlEntry[] = [];
  const walk = (node: Element, folder: string | null) => {
    for (const child of Array.from(node.children)) {
      if (child.tagName.toLowerCase() !== "outline") {
        walk(child, folder);
        continue;
      }
      const url = child.getAttribute("xmlUrl") ?? child.getAttribute("xmlurl");
      const title = child.getAttribute("title") ?? child.getAttribute("text");
      if (url) entries.push({ url, title, folder });
      else walk(child, title ?? folder);
    }
  };
  const body = document.querySelector("body");
  if (body) walk(body as unknown as Element, null);
  return entries;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildOpml(
  title: string,
  items: { url: string; title: string; siteUrl: string | null; folder: string | null }[],
): string {
  const outline = (i: (typeof items)[number]) =>
    `<outline type="rss" text="${esc(i.title)}" title="${esc(i.title)}" xmlUrl="${esc(i.url)}"${i.siteUrl ? ` htmlUrl="${esc(i.siteUrl)}"` : ""}/>`;

  const byFolder = new Map<string | null, typeof items>();
  for (const item of items) byFolder.set(item.folder, [...(byFolder.get(item.folder) ?? []), item]);

  const lines: string[] = [];
  for (const [folder, list] of byFolder) {
    if (folder === null) lines.push(...list.map((i) => `    ${outline(i)}`));
    else lines.push(`    <outline text="${esc(folder)}" title="${esc(folder)}">`, ...list.map((i) => `      ${outline(i)}`), "    </outline>");
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>${esc(title)}</title><dateCreated>${new Date().toUTCString()}</dateCreated></head>
  <body>
${lines.join("\n")}
  </body>
</opml>
`;
}
