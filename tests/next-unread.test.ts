import { describe, expect, it } from "vitest";
import { nextUnreadFeedId, orderedSidebarFeeds } from "@/lib/feeds/next-unread";

const feeds = (ids: [string, number][]) => ids.map(([feedId, unread]) => ({ feedId, unread }));

describe("orderedSidebarFeeds", () => {
  it("lista pastas na ordem e depois os sem pasta", () => {
    expect(
      orderedSidebarFeeds({
        folders: [
          { subscriptions: feeds([["a", 1], ["b", 0]]) },
          { subscriptions: feeds([["c", 2]]) },
        ],
        unfiled: feeds([["d", 3]]),
      }).map((f) => f.feedId),
    ).toEqual(["a", "b", "c", "d"]);
  });
});

describe("nextUnreadFeedId", () => {
  const list = feeds([
    ["alpha", 0],
    ["beta", 4],
    ["gamma", 0],
    ["delta", 2],
  ]);

  it("avança para o próximo com não lidos", () => {
    expect(nextUnreadFeedId(list, "beta")).toBe("delta");
  });

  it("pula feeds já lidos", () => {
    expect(nextUnreadFeedId(list, "alpha")).toBe("beta");
  });

  it("dá a volta para o primeiro com não lidos", () => {
    expect(nextUnreadFeedId(list, "delta")).toBe("beta");
  });

  it("fica nulo quando não há outro feed com não lidos", () => {
    expect(nextUnreadFeedId(feeds([["only", 0]]), "only")).toBeNull();
    expect(nextUnreadFeedId(feeds([["only", 5]]), "only")).toBeNull();
  });

  it("ignora o feed atual mesmo se ainda tiver não lidos", () => {
    expect(nextUnreadFeedId(feeds([["a", 1], ["b", 0], ["c", 3]]), "a")).toBe("c");
  });
});
