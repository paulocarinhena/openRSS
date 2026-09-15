"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ArticleDetail } from "@/lib/queries";
import { setRead, setSaved } from "@/app/actions/articles";
import { Reader } from "@/components/articles/reader";

export function StandaloneReader({ article: initial, aiEnabled }: { article: ArticleDetail; aiEnabled: boolean }) {
  const router = useRouter();
  const [article, setArticle] = useState(initial);
  const state = article.state ?? {
    userId: "",
    articleId: article.id,
    isRead: true,
    isSaved: false,
    readAt: null,
    savedAt: null,
    priorityScore: null,
    priorityReason: null,
    classifiedAt: null,
  };

  return (
    <div className="flex h-full">
      <Reader
        standalone
        article={article}
        aiEnabled={aiEnabled}
        onClose={() => router.back()}
        onToggleRead={async () => {
          setArticle({ ...article, state: { ...state, isRead: !state.isRead } });
          await setRead(article.id, !state.isRead);
        }}
        onToggleSaved={async () => {
          setArticle({ ...article, state: { ...state, isSaved: !state.isSaved } });
          await setSaved(article.id, !state.isSaved);
        }}
      />
    </div>
  );
}
