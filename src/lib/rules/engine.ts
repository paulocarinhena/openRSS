import { z } from "zod";
import { stripHtml } from "@/lib/utils";

export const RULE_FIELDS = ["title", "content", "author", "url", "feed", "score"] as const;
export const TEXT_OPS = ["contains", "notContains", "equals", "regex"] as const;
export const SCORE_OPS = ["gte", "lte"] as const;
export const RULE_ACTIONS = ["markRead", "save", "highlight", "notify"] as const;
export const RULE_SCOPES = ["all", "feed", "folder"] as const;
export const WEBHOOK_FORMATS = ["json", "ntfy", "discord", "slack", "telegram"] as const;

export type RuleField = (typeof RULE_FIELDS)[number];
export type RuleAction = (typeof RULE_ACTIONS)[number];
export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];

/** Limites contra regex catastrófica: padrão curto, sem quantificador aninhado, entrada cortada. */
const MAX_PATTERN = 200;
const MAX_REGEX_INPUT = 5000;
export const MAX_CONDITIONS = 10;

/**
 * Rejeita grupos repetidos que contêm quantificador ou alternância, ex.: (a+)+, (\w*)*, (a|aa)+.
 * É a forma clássica de backtracking exponencial; o resto do padrão fica permitido.
 */
export function isSafeRegex(pattern: string): boolean {
  if (pattern.length > MAX_PATTERN) return false;
  try {
    new RegExp(pattern, "iu");
  } catch {
    return false;
  }
  const stack: boolean[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "(") stack.push(false);
    else if (ch === ")") {
      const hadQuantifier = stack.pop() ?? false;
      const next = pattern[i + 1];
      if (hadQuantifier && (next === "*" || next === "+" || next === "{")) return false;
      if (hadQuantifier && stack.length) stack[stack.length - 1] = true;
    } else if ((ch === "*" || ch === "+" || ch === "{" || ch === "|") && stack.length) {
      // Alternância dentro de grupo repetido, ex.: (a|aa)+, também explode.
      stack[stack.length - 1] = true;
    }
  }
  return true;
}

// Mensagens são chaves de rules.errors (traduzidas por actionErrorMessage).
export const conditionSchema = z
  .object({
    field: z.enum(RULE_FIELDS),
    op: z.enum([...TEXT_OPS, ...SCORE_OPS]),
    value: z.string().trim().min(1, "valueRequired").max(MAX_PATTERN, "valueTooLong"),
  })
  .superRefine((c, ctx) => {
    if (c.field === "score") {
      const n = Number(c.value);
      if (!(SCORE_OPS as readonly string[]).includes(c.op)) ctx.addIssue({ code: "custom", message: "invalidOperator" });
      else if (!Number.isInteger(n) || n < 0 || n > 100) ctx.addIssue({ code: "custom", message: "invalidScore" });
    } else if (!(TEXT_OPS as readonly string[]).includes(c.op)) {
      ctx.addIssue({ code: "custom", message: "invalidOperator" });
    } else if (c.op === "regex" && !isSafeRegex(c.value)) {
      ctx.addIssue({ code: "custom", message: "invalidRegex" });
    }
  });

export type RuleCondition = z.output<typeof conditionSchema>;

export const conditionsSchema = z.array(conditionSchema).min(1, "conditionRequired").max(MAX_CONDITIONS, "tooManyConditions");
export const actionsSchema = z.array(z.enum(RULE_ACTIONS)).min(1, "actionRequired");

/** Artigo no formato avaliado pelas regras. `score` é a nota da IA para o dono da regra. */
export type RuleArticle = {
  title: string;
  url: string | null;
  author: string | null;
  content: string;
  feedTitle: string;
  score: number | null;
};

export function toRuleArticle(a: {
  title: string;
  url: string | null;
  author: string | null;
  contentHtml?: string | null;
  snippet?: string | null;
  feed: { title: string };
  score?: number | null;
}): RuleArticle {
  return {
    title: a.title,
    url: a.url,
    author: a.author,
    content: stripHtml(a.contentHtml ?? a.snippet ?? ""),
    feedTitle: a.feed.title,
    score: a.score ?? null,
  };
}

/** Sem acentos e sem caixa: "Eleição" casa com "eleicao". */
const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const fieldText = (a: RuleArticle, field: Exclude<RuleField, "score">) =>
  ({ title: a.title, content: a.content, author: a.author ?? "", url: a.url ?? "", feed: a.feedTitle })[field];

/** A regra precisa da nota da IA? Então só roda depois da classificação. */
export const needsScore = (conditions: RuleCondition[]) => conditions.some((c) => c.field === "score");

export function parseConditions(json: string): RuleCondition[] {
  try {
    const parsed = conditionsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function parseActions(json: string): RuleAction[] {
  try {
    const parsed = actionsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Compila a regra uma vez (regex incluída) e devolve o predicado. Condições inválidas nunca casam. */
export function compileRule(rule: { matchAll: boolean; conditions: RuleCondition[] }): (a: RuleArticle) => boolean {
  const tests = rule.conditions.map((c): ((a: RuleArticle) => boolean) => {
    if (c.field === "score") {
      const limit = Number(c.value);
      return (a) => a.score !== null && (c.op === "gte" ? a.score >= limit : a.score <= limit);
    }
    const field = c.field;
    if (c.op === "regex") {
      if (!isSafeRegex(c.value)) return () => false;
      const re = new RegExp(c.value, "iu");
      return (a) => re.test(fieldText(a, field).slice(0, MAX_REGEX_INPUT));
    }
    const needle = normalize(c.value);
    switch (c.op) {
      case "contains":
        return (a) => normalize(fieldText(a, field)).includes(needle);
      case "notContains":
        return (a) => !normalize(fieldText(a, field)).includes(needle);
      case "equals":
        return (a) => normalize(fieldText(a, field)).trim() === needle;
      default:
        return () => false;
    }
  });
  if (tests.length === 0) return () => false;
  return rule.matchAll ? (a) => tests.every((t) => t(a)) : (a) => tests.some((t) => t(a));
}
