import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-reader text-sm [&_h2]:text-base", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = "", children }) =>
            href.startsWith("/") ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          // Texto gerado por IA a partir de conteúdo de terceiros: uma imagem remota carregaria sozinha
          // e poderia vazar dados da conversa na URL. Mostra só o texto alternativo.
          img: ({ alt }) => (alt ? <span>{alt}</span> : null),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
