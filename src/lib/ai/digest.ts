import "server-only";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { stripHtml, truncate } from "@/lib/utils";
import { withLock } from "@/lib/jobs/lock";
import { resolveModel } from "./providers";
import { errorMessage, languageName } from "./content";

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
    return db.digest.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, content: "Nenhum artigo novo nas últimas 24 horas.", articleIds: "[]" },
      update: { content: "Nenhum artigo novo nas últimas 24 horas.", articleIds: "[]" },
    });
  }

  const selected = articles
    .sort((a, b) => (b.states[0]?.priorityScore ?? 50) - (a.states[0]?.priorityScore ?? 50))
    .slice(0, MAX_ARTICLES);

  const { model, modelId } = await resolveModel(userId);
  const { text } = await generateText({
    model,
    instructions: `Você escreve o digest diário de um leitor de RSS, em ${languageName(settings.language)} e Markdown.
- Agrupe os artigos por tema com títulos "## Tema".
- Em cada tema, escreva 1 a 3 frases sintetizando o que aconteceu e liste os artigos mais relevantes como links no formato [título](/article/ID).
- Comece com um parágrafo curto "Em resumo" com os 3 fatos mais importantes.
- Não invente fatos; use apenas os trechos fornecidos. Omita artigos irrelevantes.${settings.interests ? `\nInteresses do usuário (priorize): ${settings.interests}` : ""}`,
    prompt: selected
      .map((a) => `ID: ${a.id}\nFeed: ${a.feed.title}\nTítulo: ${a.title}\nTrecho: ${truncate(a.snippet ?? stripHtml(a.contentHtml ?? ""), 300)}`)
      .join("\n---\n"),
    maxOutputTokens: 2500,
  });

  const data = { content: text, articleIds: JSON.stringify(selected.map((a) => a.id)), model: modelId, createdAt: now };
  return db.digest.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, ...data },
    update: data,
  });
}

export async function generateDigest(userId: string, now = new Date()) {
  const day = dayInTimezone(now, (await db.userSettings.upsert({ where: { userId }, create: { userId }, update: {} })).timezone);
  const result = await withLock(`digest:${userId}:${day}`, 5 * 60_000, () => generateDigestUnlocked(userId, now));
  if (!result) throw new Error("O digest deste usuário já está sendo gerado.");
  return result;
}

/** Chamado de hora em hora: gera digests agendados que ainda não existem hoje. */
export async function runScheduledDigests(now = new Date()) {
  const users = await db.userSettings.findMany({ where: { digestEnabled: true } });
  for (const s of users) {
    if (!digestTimeReached(now, s.timezone, s.digestHour)) continue;
    const exists = await db.digest.findUnique({ where: { userId_day: { userId: s.userId, day: dayInTimezone(now, s.timezone) } } });
    if (exists) continue;
    try {
      await generateDigest(s.userId, now);
    } catch (err) {
      console.error(`[ai:digest] user=${s.userId}`, errorMessage(err));
    }
  }
}
