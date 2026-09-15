import { describe, expect, it } from "vitest";
import { extractPreviewImage } from "@/lib/feeds/preview-image";

describe("extractPreviewImage", () => {
  it("prefere og:image e resolve URL relativa", () => {
    const html = `<html><head>
      <meta name="twitter:image" content="https://cdn.test/tw.jpg">
      <meta content="/img/capa.jpg?a=1&amp;b=2" property="og:image" />
    </head></html>`;
    expect(extractPreviewImage(html, "https://site.test/post/1")).toBe("https://site.test/img/capa.jpg?a=1&b=2");
  });

  it("usa twitter:image quando não há og:image", () => {
    expect(extractPreviewImage(`<meta name='twitter:image' content='https://cdn.test/tw.png'>`, "https://site.test/")).toBe("https://cdn.test/tw.png");
  });

  it("usa link rel=image_src como último recurso", () => {
    expect(extractPreviewImage(`<link rel="image_src" href="//cdn.test/x.webp">`, "https://site.test/")).toBe("https://cdn.test/x.webp");
  });

  it("retorna null sem imagem ou com esquema inválido", () => {
    expect(extractPreviewImage("<html><head><title>x</title></head></html>", "https://site.test/")).toBeNull();
    expect(extractPreviewImage(`<meta property="og:image" content="javascript:alert(1)">`, "https://site.test/")).toBeNull();
  });
});
