import { SearchBar } from "../components/search/SearchBar";
import { CandidateList } from "../components/search/CandidateList";
import { ArticleView } from "../components/article/ArticleView";
import { useSearchStore } from "../stores/searchStore";
import { useBreakpoint } from "../hooks/useMediaQuery";

export function LookupPage() {
  const query = useSearchStore((s) => s.query);
  const breakpoint = useBreakpoint();

  const hasContent = query.trim().length > 0;
  const showCandidateList = breakpoint !== "small";

  return (
    <div className="flex h-full flex-col">
      <SearchBar />

      {!hasContent ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-base text-text-secondary">
              Type a word to look it up
            </p>
            <p className="mt-1 text-sm text-text-tertiary">
              Press / to focus search
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {showCandidateList && (
            <aside className="flex w-[280px] shrink-0 flex-col border-r border-border">
              <CandidateList />
            </aside>
          )}
          <ArticleView />
        </div>
      )}
    </div>
  );
}
