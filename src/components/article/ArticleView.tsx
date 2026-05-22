import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchStore } from "../../stores/searchStore";
import { DictTabBar } from "./DictTabBar";
import { DictSection } from "./DictSection";
import { Skeleton } from "../ui/Skeleton";

interface GroupedArticle {
  dict_id: string;
  dict_name: string;
  htmlParts: string[];
}

export function ArticleView() {
  const articles = useSearchStore((s) => s.articles);
  const currentWord = useSearchStore((s) => s.currentWord);
  const isLoading = useSearchStore((s) => s.isLoadingArticles);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Group articles by dict_id so each dictionary is one collapsible section
  const grouped = useMemo<GroupedArticle[]>(() => {
    const map = new Map<string, GroupedArticle>();
    for (const a of articles) {
      let group = map.get(a.dict_id);
      if (!group) {
        group = { dict_id: a.dict_id, dict_name: a.dict_name, htmlParts: [] };
        map.set(a.dict_id, group);
      }
      group.htmlParts.push(a.html);
    }
    return Array.from(map.values());
  }, [articles]);

  const dictNames = grouped.map((g) => g.dict_name);

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
        {grouped.map((group, i) => (
          <DictSection
            key={`${group.dict_id}-${i}`}
            id={`dict-section-${i}`}
            dictName={group.dict_name}
            dictId={group.dict_id}
            html={group.htmlParts.join('<hr style="margin:1em 0;border:none;border-top:1px solid #e0e0e0">')}
          />
        ))}
      </div>
    </div>
  );
}
