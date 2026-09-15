"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center">
      <TriangleAlert className="size-6 text-destructive" aria-hidden />
      <div>
        <h1 className="font-semibold">Não foi possível carregar esta página</h1>
        <p className="mt-1 text-sm text-muted-foreground">O erro pode ser temporário. Tente novamente.</p>
      </div>
      <Button variant="primary" onClick={() => retry()}>
        Tentar novamente
      </Button>
    </div>
  );
}
