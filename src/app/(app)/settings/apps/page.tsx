import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AppsSettings } from "./apps-settings";

/** Endereço público: BETTER_AUTH_URL, ou o host da requisição atrás de proxy. */
async function publicOrigin() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function AppsSettingsPage() {
  const user = await requireUser();
  const [tokens, origin] = await Promise.all([
    db.apiToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    }),
    publicOrigin(),
  ]);
  return (
    <AppsSettings
      tokens={tokens}
      email={user.email}
      greaderUrl={`${origin}/api/greader`}
      feverUrl={`${origin}/api/fever`}
      saveUrl={`${origin}/save`}
    />
  );
}
