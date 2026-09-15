import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Hostname fictício resolvido para loopback: força o net a usar o lookup customizado do Agent.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]),
}));

const { createPinnedWebFetch, pinnedFetch } = await import("@/lib/network");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((_req, res) => res.end("pong"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://pinned.test:${(server.address() as AddressInfo).port}/`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("pinnedFetch", () => {
  it("connects to the pinned address through a hostname", async () => {
    const { response, close } = await pinnedFetch(baseUrl, {}, true);
    expect(await response.text()).toBe("pong");
    await close();
  });

  it("works through the Web Fetch adapter used by AI SDKs", async () => {
    const response = await createPinnedWebFetch(true)(baseUrl);
    expect(await response.text()).toBe("pong");
  });
});
