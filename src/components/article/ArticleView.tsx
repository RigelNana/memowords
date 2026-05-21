import { useCallback, useRef, useState } from "react";
import { useSearchStore } from "../../stores/searchStore";
import { DictTabBar } from "./DictTabBar";
import { DictSection } from "./DictSection";
import { Skeleton } from "../ui/Skeleton";

export function ArticleView() {
  const articles = useSearchStore((s) => s.articles);
  const currentWord = useSearchStore((s) => s.currentWord);
  const isLoading = useSearchStore((s) => s.isLoadingArticles);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(0);

  const dictNames = articles.map((a) => a.dict_name);

  const handleTabClick = useCallback(
    (index: number) => {
      setActiveTab(index);
      const el = document.getElementById(`dict-section-${index}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-4">
          <Skeleton className="h-7 w-40 rounded-[var(--radius-sm)]" />
          <Skeleton className="h-4 w-full rounded-[var(--radius-sm)]" />
          <Skeleton className="h-4 w-4/5 rounded-[var(--radius-sm)]" />
          <Skeleton className="h-4 w-3/5 rounded-[var(--radius-sm)]" />
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    if (!currentWord) return null;

    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-text-tertiary">No definition available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <DictTabBar
        dictNames={dictNames}
        activeIndex={activeTab}
        onTabClick={handleTabClick}
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {articles.map((article, i) => (
          <DictSection
            key={`${article.dict_name}-${i}`}
            id={`dict-section-${i}`}
            dictName={article.dict_name}
            html={article.html}
          />
        ))}
      </div>
    </div>
  );
}
