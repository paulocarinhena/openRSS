import "server-only";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { staticTranslator } from "@/i18n/static";
import { buttonHtml, emailLayout, sendMail } from "@/lib/mail";

type HastNode = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[]; value?: string };

/**
 * Ajusta o HTML para e-mail: links internos (/article/ID) viram absolutos, links ganham cor
 * (clientes de e-mail ignoram CSS externo) e imagens remotas viram o texto alternativo.
 */
function emailFriendly(base: string | undefined) {
  const visit = (node: HastNode) => {
    node.children = node.children?.flatMap((child) => {
      if (child.type === "element" && child.tagName === "img") {
        const alt = String(child.properties?.alt ?? "");
        return alt ? [{ type: "text", value: alt }] : [];
      }
      if (child.type === "element" && child.tagName === "a") {
        const href = String(child.properties?.href ?? "");
        child.properties = { ...child.properties, href: href.startsWith("/") && base ? `${base}${href}` : href, style: "color:#1b3f63" };
      }
      visit(child);
      return [child];
    });
  };
  return () => (tree: HastNode) => visit(tree);
}

/** Markdown do digest → HTML de e-mail. HTML cru no Markdown é descartado (remark-rehype sem allowDangerousHtml). */
export function digestHtml(markdown: string, base: string | undefined) {
  return String(
    unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(emailFriendly(base)).use(rehypeStringify).processSync(markdown),
  );
}

export async function sendDigestEmail(to: string, locale: string, digest: { id: string; day: string; content: string }) {
  const base = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
  const t = staticTranslator(locale, "mail.digest");
  const title = t("subject", { day: digest.day });
  await sendMail({
    to,
    subject: title,
    text: `${digest.content}\n\n${base ? `${base}/digest` : ""}`,
    html: emailLayout({
      title,
      bodyHtml: `${digestHtml(digest.content, base)}${base ? buttonHtml(t("open"), `${base}/digest`) : ""}`,
      footer: t("footer"),
    }),
  });
}
