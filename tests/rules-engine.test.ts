import { describe, expect, it } from "vitest";
import { compileRule, conditionsSchema, isSafeRegex, needsScore, type RuleArticle } from "@/lib/rules/engine";
import { buildWebhookRequest } from "@/lib/rules/webhook";

const article = (over: Partial<RuleArticle> = {}): RuleArticle => ({
  title: "Oferta imperdível: cupom de 50%",
  url: "https://loja.test/promo",
  author: "Equipe Loja",
  content: "Promoção por tempo limitado na eleição de preços.",
  feedTitle: "Loja Blog",
  score: null,
  ...over,
});

describe("rule engine", () => {
  it("matches text case- and accent-insensitively", () => {
    const test = compileRule({ matchAll: true, conditions: [{ field: "content", op: "contains", value: "ELEIÇÃO" }] });
    expect(test(article())).toBe(true);
    expect(test(article({ content: "nada aqui" }))).toBe(false);
  });

  it("combines conditions with all/any", () => {
    const conditions = [
      { field: "title", op: "contains", value: "cupom" },
      { field: "author", op: "equals", value: "outro autor" },
    ] as const;
    expect(compileRule({ matchAll: true, conditions: [...conditions] })(article())).toBe(false);
    expect(compileRule({ matchAll: false, conditions: [...conditions] })(article())).toBe(true);
  });

  it("supports notContains, equals and regex", () => {
    expect(compileRule({ matchAll: true, conditions: [{ field: "feed", op: "notContains", value: "news" }] })(article())).toBe(true);
    expect(compileRule({ matchAll: true, conditions: [{ field: "author", op: "equals", value: "equipe loja" }] })(article())).toBe(true);
    expect(compileRule({ matchAll: true, conditions: [{ field: "url", op: "regex", value: "/promo$" }] })(article())).toBe(true);
  });

  it("only matches score conditions when a score exists", () => {
    const test = compileRule({ matchAll: true, conditions: [{ field: "score", op: "lte", value: "20" }] });
    expect(test(article())).toBe(false);
    expect(test(article({ score: 10 }))).toBe(true);
    expect(test(article({ score: 60 }))).toBe(false);
    expect(needsScore([{ field: "score", op: "gte", value: "90" }])).toBe(true);
  });

  it.each(["(a+)+", "(\\w*)*", "(a|aa)+", "((ab)+)+", "("])("rejects risky or invalid regex %s", (pattern) => {
    expect(isSafeRegex(pattern)).toBe(false);
  });

  it.each(["^(oferta|cupom)", "(ab)+", "patrocinad[oa]s?", "\\(a+\\)+"])("accepts safe regex %s", (pattern) => {
    expect(isSafeRegex(pattern)).toBe(true);
  });

  it("validates conditions with translatable keys", () => {
    const bad = conditionsSchema.safeParse([{ field: "score", op: "contains", value: "x" }]);
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("invalidOperator");
    expect(conditionsSchema.safeParse([{ field: "score", op: "gte", value: "101" }]).error?.issues[0]?.message).toBe("invalidScore");
    expect(conditionsSchema.safeParse([]).error?.issues[0]?.message).toBe("conditionRequired");
  });
});

describe("webhook formats", () => {
  const payload = { rule: "Imperdíveis", article: { id: "a1", title: "Título", url: "https://site.test/a", feed: "Feed", score: 95 } };

  it("publishes ntfy as JSON on the server root with the topic", () => {
    const req = buildWebhookRequest("https://ntfy.sh/meu-topico", "ntfy", payload);
    expect(req.url).toBe("https://ntfy.sh/");
    expect(req.body).toMatchObject({ topic: "meu-topico", title: "openRSS · Imperdíveis" });
  });

  it("moves the Telegram chat_id from the query to the body", () => {
    const req = buildWebhookRequest("https://api.telegram.org/botTOKEN/sendMessage?chat_id=42", "telegram", payload);
    expect(req.url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(req.body).toMatchObject({ chat_id: "42" });
    expect(() => buildWebhookRequest("https://api.telegram.org/botTOKEN/sendMessage", "telegram", payload)).toThrow();
  });

  it("formats Discord, Slack and generic JSON", () => {
    expect(buildWebhookRequest("https://discord.test/hook", "discord", payload).body).toHaveProperty("content");
    expect(buildWebhookRequest("https://slack.test/hook", "slack", payload).body).toHaveProperty("text");
    expect(buildWebhookRequest("https://x.test/hook", "json", payload).body).toMatchObject({ event: "rule.matched", rule: "Imperdíveis" });
  });
});
