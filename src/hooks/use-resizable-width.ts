"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const EVENT = "openrss:resize";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function readStored(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, width: number | null) {
  try {
    if (width === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(width));
  } catch {
    // Armazenamento indisponível: a largura vale só nesta sessão da página.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Largura redimensionável por arraste, persistida no navegador.
 * Lê o localStorage via useSyncExternalStore (servidor usa o padrão), sem setState em efeito.
 */
export function useResizableWidth(
  storageKey: string,
  { defaultWidth, min, max, minContent = 360 }: { defaultWidth: number; min: number; max: number; minContent?: number },
) {
  const stored = useSyncExternalStore(subscribe, () => readStored(storageKey), () => null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const clamp = useCallback(
    (w: number) => Math.round(Math.max(min, Math.min(max, window.innerWidth - minContent, w))),
    [max, min, minContent],
  );

  const width = dragWidth ?? (stored === null ? defaultWidth : Math.max(min, Math.min(max, stored)));

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = width;
    let last = startWidth;

    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (ev: PointerEvent) => {
      last = clamp(startWidth + ev.clientX - startX);
      setDragWidth(last);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      writeStored(storageKey, last);
      setDragWidth(null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const next =
      e.key === "ArrowLeft" ? width - 16 : e.key === "ArrowRight" ? width + 16 : e.key === "Home" ? min : e.key === "End" ? max : null;
    if (next === null) return;
    e.preventDefault();
    writeStored(storageKey, clamp(next));
  }

  return {
    width,
    dragging: dragWidth !== null,
    handleProps: {
      role: "separator",
      "aria-orientation": "vertical" as const,
      "aria-valuenow": width,
      "aria-valuemin": min,
      "aria-valuemax": max,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
      onDoubleClick: () => writeStored(storageKey, null),
    },
  };
}
