"use client";

import { usePathname } from "next/navigation";
import { History, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThreadList } from "./thread-list";

type Thread = { id: string; title: string; updatedAt: Date };

export function MobileThreadList({ threads }: { threads: Thread[] }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => setOpenOn(next ? pathname : null)}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm">
          <History /> Histórico
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background shadow-card outline-none md:hidden">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
            <Dialog.Title className="text-sm font-semibold">Histórico de conversas</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar histórico">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Escolha, selecione ou exclua conversas anteriores.</Dialog.Description>
          <ThreadList threads={threads} onNavigate={() => setOpenOn(null)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
