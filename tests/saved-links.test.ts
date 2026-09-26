import { describe, expect, it } from "vitest";
import { firstUrlIn, isSavedLinksFeed, normalizeLinkUrl } from "@/lib/feeds/saved-links";

describe("saved links", () => {
  it("accepts only http(s) and drops the fragment", () => {
    expect(normalizeLinkUrl(" https://site.test/a?b=1#topo ")).toBe("https://site.test/a?b=1");
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeLinkUrl("não é url")).toBeNull();
  });

  it("finds the link inside text shared from a phone", () => {
    expect(firstUrlIn("Olha isso: https://site.test/post-1. Muito bom!")).toBe("https://site.test/post-1");
    expect(firstUrlIn("(https://site.test/x)")).toBe("https://site.test/x");
    expect(firstUrlIn("sem link")).toBeNull();
  });

  it("recognizes the virtual feed", () => {
    expect(isSavedLinksFeed("urn:openrss:saved-links:u1")).toBe(true);
    expect(isSavedLinksFeed("https://site.test/feed")).toBe(false);
  });
});
