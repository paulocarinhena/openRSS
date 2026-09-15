import { Rss } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <LanguageSwitcher className="w-44" />
        <ThemeToggle />
      </div>
      <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Rss className="size-5 text-primary" />
        openRSS
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
