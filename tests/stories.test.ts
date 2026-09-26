import { describe, expect, it } from "vitest";
import { storySimilarity, titleTokens } from "@/lib/feeds/stories";
import { groupByStory, type RelatedSource } from "@/lib/queries";

const sim = (a: string, b: string) => storySimilarity(titleTokens(a), titleTokens(b));

describe("story similarity", () => {
  it("normalizes accents, case, stopwords and simple plurals", () => {
    expect([...titleTokens("As Eleições de 2026: o que muda nos Estados")]).toEqual(["eleicoe", "2026", "muda", "estado"]);
  });

  it.each([
    ["Apple anuncia novo iPhone 17 com câmera melhor", "iPhone 17: Apple anuncia câmera melhor e chip novo"],
    ["Banco Central mantém Selic em 10,5% ao ano", "Selic: Banco Central mantém taxa em 10,5%"],
    ["SpaceX launches Starship on fifth test flight", "Starship fifth test flight: SpaceX launches rocket"],
  ])("groups %s ~ %s", (a, b) => {
    expect(sim(a, b)).toBeGreaterThan(0);
  });

  it.each([
    ["Apple anuncia novo MacBook Pro", "Apple anuncia novo iPhone"],
    ["Banco Central mantém Selic", "Banco do Brasil lucra mais no trimestre"],
    ["Chuva forte", "Chuva forte em São Paulo alaga ruas"],
  ])("keeps apart %s / %s", (a, b) => {
    expect(sim(a, b)).toBe(0);
  });

  it("collapses related items under the first one of each story", () => {
    const item = (id: string, storyId: string | null) => ({ id, storyId, title: id, isRead: false, feed: { title: `F-${id}` }, related: [] as RelatedSource[] });
    const grouped = groupByStory([item("a", "s1"), item("b", null), item("c", "s1"), item("d", "s2"), item("e", "s1")]);
    expect(grouped.map((i) => i.id)).toEqual(["a", "b", "d"]);
    expect(grouped[0].related.map((r) => r.id)).toEqual(["c", "e"]);
  });
});
