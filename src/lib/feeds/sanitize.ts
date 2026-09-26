import sanitizeHtml from "sanitize-html";

const EMBED_HOSTS = ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"];

export function sanitizeArticleHtml(html: string, baseUrl?: string | null): string {
  const absolute = (value: string) => {
    if (!baseUrl || !value) return value;
    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return value;
    }
  };

  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img", "figure", "figcaption", "picture", "source", "video", "audio", "iframe", "del", "ins", "sup", "sub", "details", "summary",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      // loading/referrerpolicy são adicionados pelo transformTags; sem estar aqui, o filtro de atributos os removeria.
      img: ["src", "srcset", "alt", "title", "width", "height", "loading", "referrerpolicy"],
      source: ["src", "srcset", "type", "media"],
      video: ["src", "poster", "controls", "width", "height"],
      audio: ["src", "controls"],
      iframe: ["src", "width", "height", "allowfullscreen", "frameborder"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      "*": ["lang", "dir"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
    allowedSchemesByTag: { img: ["http", "https", "data"], a: ["http", "https", "mailto"] },
    allowedIframeHostnames: EMBED_HOSTS,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, href: absolute(attribs.href ?? ""), target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, src: absolute(attribs.src ?? ""), loading: "lazy", referrerpolicy: "no-referrer" },
      }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && (!frame.attribs.src || /(^|\/)(pixel|spacer|tracking)\b/i.test(frame.attribs.src)),
  });
}

/** Primeira imagem do HTML (para miniaturas na lista). */
export function firstImage(html: string | null | undefined): string | null {
  if (!html) return null;
  return /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
}
