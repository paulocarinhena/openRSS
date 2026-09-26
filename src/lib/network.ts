import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { LocalizedError } from "@/lib/localized-error";

const blockedAddresses = new BlockList();

for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(address, prefix, "ipv4");
}

for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  // NAT64 e 6to4 embutem um IPv4 arbitrário (inclusive privado) no endereço IPv6.
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2002::", 16],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(address, prefix, "ipv6");
}

export function isPrivateAddress(address: string) {
  const family = isIP(address);
  return family === 0 || blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

export async function resolveNetworkTarget(input: string | URL, allowPrivateNetwork = false) {
  const url = new URL(input);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new LocalizedError("invalidUrl");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!allowPrivateNetwork && (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal"))) {
    throw new LocalizedError("privateNetwork");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || (!allowPrivateNetwork && addresses.some(({ address }) => isPrivateAddress(address)))) {
    throw new LocalizedError("privateNetwork");
  }

  return { url, address: addresses[0].address, family: addresses[0].family as 4 | 6 };
}

/** Resolve e valida uma vez; o Agent reutiliza exatamente o IP aprovado na conexão. */
export async function pinnedFetch(
  input: string | URL,
  init: Omit<NonNullable<Parameters<typeof undiciFetch>[1]>, "dispatcher"> = {},
  allowPrivateNetwork = false,
) {
  const target = await resolveNetworkTarget(input, allowPrivateNetwork);
  const dispatcher = new Agent({
    connect: {
      // Com autoSelectFamily (padrão no Node 20+), o net chama lookup com { all: true } e espera um array.
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
    },
  });
  try {
    const response = await undiciFetch(target.url, { ...init, dispatcher });
    return { response, close: () => dispatcher.close() };
  } catch (error) {
    await dispatcher.close();
    throw error;
  }
}

/** Adaptador Fetch padrão para SDKs que consomem o corpo depois do retorno da chamada. */
export function createPinnedWebFetch(allowPrivateNetwork = false): typeof fetch {
  return async (input, init) => {
    const connection = await pinnedFetch(
      typeof input === "string" || input instanceof URL ? input : input.url,
      { ...init, redirect: "error" } as unknown as Omit<NonNullable<Parameters<typeof undiciFetch>[1]>, "dispatcher">,
      allowPrivateNetwork,
    );
    const source = connection.response;
    const headers = new Headers();
    source.headers.forEach((value, name) => headers.append(name, value));

    if (!source.body) {
      await connection.close();
      return new Response(null, { status: source.status, statusText: source.statusText, headers });
    }

    const reader = source.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            await connection.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
          await connection.close();
        }
      },
      async cancel(reason) {
        await reader.cancel(reason);
        await connection.close();
      },
    });
    return new Response(body, { status: source.status, statusText: source.statusText, headers });
  };
}
