"use client";

import { useEffect } from "react";

/** Mensagem para o service worker (public/sw.js), se houver um ativo. */
export function postToServiceWorker(message: { type: "sync-offline" | "clear" }) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage(message);
}

/** Registra o service worker e sincroniza os artigos para leitura offline ao abrir o app e ao voltar a conexão. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Em dev o cache do service worker atrapalharia o hot reload.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sync = () => navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: "sync-offline" }));
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(sync)
      .catch((error) => console.warn("[sw]", error));
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);
  return null;
}
