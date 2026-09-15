import "server-only";
import { pinnedFetch } from "@/lib/network";

export const USER_AGENT = "openRSS/0.1 (+https://github.com/paulocarinhena/openRSS; feed reader)";

export class FetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export type SafeFetchResult = {
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  body: string;
};

/** fetch com timeout, limite de tamanho, redirects checados e proteção SSRF. */
export async function safeFetch(
  input: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number; accept?: string } = {},
): Promise<SafeFetchResult> {
  const { timeoutMs = 15000, maxBytes = 5 * 1024 * 1024 } = opts;
  let url = new URL(input);

  for (let hop = 0; hop < 5; hop++) {
    let connection: Awaited<ReturnType<typeof pinnedFetch>>;
    try {
      connection = await pinnedFetch(
        url,
        {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "user-agent": USER_AGENT,
            accept: opts.accept ?? "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
            ...opts.headers,
          },
        },
        process.env.ALLOW_PRIVATE_FEEDS === "true",
      );
    } catch (error) {
      throw new FetchError(error instanceof Error ? error.message : String(error));
    }
    try {
      const res = connection.response;
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (res.status === 304) return { status: 304, url: url.toString(), headers: res.headers, body: "" };
      if (!res.ok) throw new FetchError(`HTTP ${res.status}`, res.status);

      const reader = res.body?.getReader();
      if (!reader) return { status: res.status, url: url.toString(), headers: res.headers, body: "" };
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new FetchError("Resposta excede o tamanho máximo permitido.");
        }
        chunks.push(value);
      }
      const buffer = Buffer.concat(chunks);
      return { status: res.status, url: url.toString(), headers: res.headers, body: decode(buffer, res.headers) };
    } finally {
      await connection.close();
    }
  }
  throw new FetchError("Redirecionamentos demais.");
}

function decode(buffer: Buffer, headers: { get(name: string): string | null }): string {
  const fromHeader = /charset=([^;]+)/i.exec(headers.get("content-type") ?? "")?.[1];
  const head = buffer.subarray(0, 1024).toString("latin1");
  const fromBody = /encoding=["']([^"']+)["']/i.exec(head)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const charset = (fromHeader ?? fromBody ?? "utf-8").trim().toLowerCase();
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}
