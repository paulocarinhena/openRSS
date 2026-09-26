import "server-only";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { stripHtml, truncate } from "@/lib/utils";
import { withLock } from "@/lib/jobs/lock";
import { staticTranslator } from "@/i18n/static";
import { resolveModel } from "./providers";
import { errorMessage, languageInstruction } from "./content";
import { AiError } from "./errors";
import { isMailConfigured } from "@/lib/mail";
import { sendDigestEmail } from "./digest-mail";

const MAX_ARTICLES = 80;

export function dayInTimezone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function hourInTimezone(date: Date, timeZone: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(date));
}

export function digestTimeReached(date: Date, timeZone: string, digestHour: number) {
  return hourInTimezone(date, timeZone) >= digestHour;
}

/** Gera (ou regenera) o digest das últimas 24h para o usuário. */
async function generateDigestUnlocked(userId: string, now: Date) {
  const settings = await db.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
  const since = new Date(now.getTime() - 24 * 3600_000);

  const articles = await db.article.findMany({
    where: {
      publishedAt: { gte: since },
      feed: { subscriptions: { some: { userId } } },
      NOT: { states: { some: { userId, isRead: true } } },
    },
    select: {
      id: true,
      title: true,
      snippet: true,
      contentHtml: true,
      feed: { select: { title: true } },
      states: { where: { userId }, select: { priorityScore: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: 300,
  });

  const day = dayInTimezone(now, settings.timezone);
  if (articles.length === 0) {
    // Texto persistido no idioma da interface vigente na geração.
    const empty = staticTranslator(settings.uiLanguage, "digest")("empty");
    return db.digest.create({ data: { userId, day, content: empty, articleIds: "[]", createdAt: now } });
  }

  const selected = articles
    .sort((a, b) => (b.states[0]?.priorityScore ?? 50) - (a.states[0]?.priorityScore ?? 50))
    .slice(0, MAX_ARTICLES);

  const { model, modelId } = await resolveModel(userId);
  const { text } = await generateText({
    model,
    instructions: `Você escreve o digest diário de um leitor de RSS, em Markdown.
- Agrupe os artigos por tema com títulos "## Tema".
- Em cada tema, escreva 1 a 3 frases sintetizando o que aconteceu e liste os artigos mais relevantes como links no formato [título](/article/ID).
- Comece com um parágrafo curto "Em resumo" com os 3 fatos mais importantes.
- Não invente fatos; use apenas os trechos fornecidos. Omita artigos irrelevantes.${settings.interests ? `\nInteresses do usuário (priorize): ${settings.interests}` : ""}
${languageInstruction(settings.language)}`,
    prompt: selected
      .map((a) => `ID: ${a.id}\nFeed: ${a.feed.title}\nTítulo: ${a.title}\nTrecho: ${truncate(a.snippet ?? stripHtml(a.contentHtml ?? ""), 300)}`)
      .join("\n---\n"),
    maxOutputTokens: 2500,
  });

  const data = { userId, day, content: text, articleIds: JSON.stringify(selected.map((a) => a.id)), model: modelId, createdAt: now };
  return db.digest.create({ data });
}

export async function generateDigest(userId: string, now = new Date()) {
  const result = await withLock(`digest:${userId}`, 5 * 60_000, () => generateDigestUnlocked(userId, now));
  if (!result) throw new AiError("digestInProgress");
  return result;
}

/** Chamado de hora em hora: gera o digest do dia, pulando quem já tem um (manual ou automático) hoje. */
export async function runScheduledDigests(now = new Date()) {
  const users = await db.userSettings.findMany({ where: { digestEnabled: true } });
  for (const s of users) {
    if (!digestTimeReached(now, s.timezone, s.digestHour)) continue;
    const exists = await db.digest.findFirst({ where: { userId: s.userId, day: dayInTimezone(now, s.timezone) } });
    if (exists) continue;
    try {
      const digest = await generateDigest(s.userId, now);
      if (s.digestEmail && isMailConfigured()) {
        const user = await db.user.findUnique({ where: { id: s.userId }, select: { email: true } });
        if (user) {
          await sendDigestEmail(user.email, s.uiLanguage, digest).catch((err) =>
            console.error(`[ai:digest:mail] user=${s.userId}`, err instanceof Error ? err.message : err),
          );
        }
      }
    } catch (err) {
      console.error(`[ai:digest] user=${s.userId}`, errorMessage(err));
    }
  }
}
