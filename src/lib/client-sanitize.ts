import DOMPurify from "dompurify";

let hooked = false;

/**
 * Saneamento no navegador para HTML gerado por IA durante o streaming (tradução).
 * Mais leve que o sanitize-html do servidor; segue as mesmas regras de links e imagens.
 */
export function sanitizeClientHtml(html: string): string {
  // Sem DOM (render no servidor) o DOMPurify devolveria a entrada intacta.
  if (typeof window === "undefined" || !DOMPurify.isSupported) return "";
  if (!hooked) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer nofollow");
      } else if (node.tagName === "IMG") {
        node.setAttribute("loading", "lazy");
        node.setAttribute("referrerpolicy", "no-referrer");
      }
    });
    hooked = true;
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "svg", "math"],
    FORBID_ATTR: ["style", "class", "id"],
    ADD_ATTR: ["target"],
  });
}
