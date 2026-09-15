import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Carregando…
    </div>
  );
}
