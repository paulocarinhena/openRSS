import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Servidor mínimo compatível com a API da OpenAI (chat em streaming e embeddings),
 * para testar as rotas de IA sem rede. `answer` recebe o corpo do chat e devolve o texto.
 */
export async function startFakeOpenAI(opts: {
  answer?: (body: { messages: { role: string; content: unknown }[] }) => string;
  embed?: (text: string) => number[];
}) {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ path: req.url ?? "", body });
      if (req.url?.endsWith("/embeddings")) {
        const inputs: string[] = Array.isArray(body.input) ? body.input : [body.input];
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          object: "list",
          model: body.model,
          data: inputs.map((text, index) => ({ object: "embedding", index, embedding: opts.embed?.(text) ?? [1, 0, 0] })),
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }));
        return;
      }
      const text = opts.answer?.(body) ?? "ok";
      if (!body.stream) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          id: "c1",
          object: "chat.completion",
          created: 0,
          model: body.model,
          choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }));
        return;
      }
      const chunk = (delta: object, finish: string | null) =>
        `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      res.setHeader("content-type", "text/event-stream");
      res.write(chunk({ role: "assistant", content: "" }, null));
      for (let i = 0; i < text.length; i += 8) res.write(chunk({ content: text.slice(i, i + 8) }, null));
      res.write(chunk({}, "stop"));
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
