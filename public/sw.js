// Service worker do openRSS: app instalável e leitura offline dos artigos salvos e recentes.
// Páginas autenticadas só entram no cache deste navegador e são apagadas no logout.

const VERSION = "v1";
const SHELL = `openrss-shell-${VERSION}`;
const STATIC = "openrss-static";
const PAGES = "openrss-pages";
const ARTICLES = "openrss-articles";
const INDEX_URL = "/__offline/index.json";
const OFFLINE_URL = "/offline.html";
const MAX_PAGES = 40;
const SHELL_ASSETS = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("openrss-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isCacheable = (response) => response && response.ok && response.type === "basic" && !response.redirected;

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

/** Navegação: rede primeiro; sem rede, a última versão vista (ou o artigo guardado), senão a página offline. */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const copy = response.clone();
      caches.open(PAGES).then((cache) => cache.put(request, copy).then(() => trim(PAGES, MAX_PAGES)));
    }
    return response;
  } catch {
    const cached = (await caches.match(request, { cacheName: ARTICLES })) ?? (await caches.match(request, { cacheName: PAGES }));
    return cached ?? (await caches.match(OFFLINE_URL));
  }
}

/** Arquivos de /_next/static têm hash no nome: cache primeiro. */
async function handleStatic(request) {
  const cached = await caches.match(request, { cacheName: STATIC });
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) {
    const copy = response.clone();
    caches.open(STATIC).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") event.respondWith(handleNavigation(request));
  else if (url.pathname.startsWith("/_next/static/")) event.respondWith(handleStatic(request));
  else if (SHELL_ASSETS.includes(url.pathname)) event.respondWith(caches.match(request, { cacheName: SHELL }).then((r) => r ?? fetch(request)));
  else if (url.pathname === INDEX_URL) event.respondWith(caches.match(INDEX_URL, { cacheName: ARTICLES }).then((r) => r ?? new Response("[]")));
});

/** Baixa as páginas dos artigos para ler offline (e os scripts/estilos que elas usam). */
async function syncOffline() {
  const res = await fetch("/api/offline/articles", { cache: "no-store" });
  if (!res.ok) return;
  const { articles } = await res.json();
  const cache = await caches.open(ARTICLES);
  const statics = await caches.open(STATIC);
  const wanted = new Set(articles.map((a) => new URL(`/article/${a.id}`, self.location.origin).href));

  for (const request of await cache.keys()) {
    if (!wanted.has(request.url) && !request.url.endsWith(INDEX_URL)) await cache.delete(request);
  }
  const index = [];
  for (const article of articles) {
    const url = `/article/${article.id}`;
    try {
      let response = await cache.match(url);
      if (!response) {
        // O cabeçalho impede que baixar para ler depois marque o artigo como lido.
        const fresh = await fetch(url, { headers: { "x-openrss-offline-sync": "1" } });
        if (!isCacheable(fresh)) continue;
        await cache.put(url, fresh.clone());
        response = fresh;
        // Os chunks da página do artigo podem ainda não ter sido carregados neste navegador.
        const html = await response.text();
        const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
        for (const asset of assets) {
          if (!(await statics.match(asset))) await statics.add(asset).catch(() => {});
        }
      }
      index.push(article);
    } catch {
      // Sem rede no meio da sincronização: tenta de novo na próxima.
    }
  }
  await cache.put(INDEX_URL, new Response(JSON.stringify(index), { headers: { "content-type": "application/json" } }));
}

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "sync-offline") event.waitUntil(syncOffline().catch(() => {}));
  if (type === "clear") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(ARTICLES)]));
});
