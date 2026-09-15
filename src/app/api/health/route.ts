import { isSetupRequired } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  // Durante o assistente de instalação o container é saudável mesmo sem banco.
  if (isSetupRequired()) return Response.json({ status: "setup" });

  try {
    const { db } = await import("@/lib/db");
    await db.$queryRawUnsafe("SELECT 1");
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
