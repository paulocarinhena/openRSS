import { cloneElement, isValidElement, useId } from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-input border border-input bg-background px-3 text-sm text-foreground shadow-control outline-none transition-colors duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-50 dark:bg-secondary";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24 py-2", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-medium text-foreground", className)} {...props} />;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const generatedId = useId();
  const child = isValidElement<{ id?: string }>(children) ? children : null;
  const controlId = child?.props.id ?? generatedId;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={controlId}>{label}</Label>
      {child ? cloneElement(child, { id: controlId }) : children}
      {hint && <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border border-border bg-surface p-5 text-surface-foreground shadow-card", className)}
      {...props}
    />
  );
}

export function Switch({
  checked,
  onCheckedChange,
  name,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  name?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors duration-200 disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted",
        className,
      )}
    >
      {name && <input type="hidden" name={name} value={checked ? "on" : ""} />}
      <span
        className={cn(
          "block size-3.5 rounded-full bg-background shadow transition-transform duration-200 dark:bg-foreground",
          checked ? "translate-x-4 dark:bg-background" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
