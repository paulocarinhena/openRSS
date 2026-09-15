"use client";

import { Rss } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function FeedIcon({ src, className }: { src?: string | null; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <Rss className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={cn("size-4 shrink-0 rounded-sm object-contain", className)}
    />
  );
}
