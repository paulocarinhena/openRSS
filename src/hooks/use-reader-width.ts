"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ReaderWidth = "narrow" | "medium" | "wide";

export const READER_WIDTHS: Record<ReaderWidth, { label: string; maxWidth: string; fontSize: string }> = {
  narrow: { label: "Estreita", maxWidth: "44rem", fontSize: "1rem" },
  medium: { label: "Média", maxWidth: "56rem", fontSize: "1.0625rem" },
  wide: { label: "Larga", maxWidth: "72rem", fontSize: "1.125rem" },
};

export const READER_WIDTH_ORDER: ReaderWidth[] = ["narrow", "medium", "wide"];

const KEY = "openrss:reader-width";

function subscribe(callback: () => void) {
  window.addEventListener(KEY, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(KEY, callback);
    window.removeEventListener("storage", callback);
  };
}

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Largura de leitura do artigo, lembrada no navegador (padrão: média). */
export function useReaderWidth() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const width: ReaderWidth = raw === "narrow" || raw === "wide" || raw === "medium" ? raw : "medium";

  const setWidth = useCallback((next: ReaderWidth) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Sem armazenamento: vale só nesta sessão da página.
    }
    window.dispatchEvent(new Event(KEY));
  }, []);

  return [width, setWidth] as const;
}
