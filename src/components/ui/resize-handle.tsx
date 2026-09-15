import { cn } from "@/lib/utils";

/** Alça vertical na borda direita de um painel (o painel precisa ser `relative`). */
export function ResizeHandle({
  label,
  dragging,
  className,
  ...props
}: React.ComponentProps<"div"> & { label: string; dragging?: boolean }) {
  return (
    <div
      aria-label={label}
      title="Arraste para redimensionar · duplo clique para restaurar"
      data-dragging={dragging || undefined}
      className={cn("group absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize touch-none outline-none", className)}
      {...props}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors duration-150 group-hover:bg-ring/40 group-focus-visible:bg-ring group-data-[dragging]:bg-ring"
      />
    </div>
  );
}
