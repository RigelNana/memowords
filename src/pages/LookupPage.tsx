import { SearchBar } from "../components/search/SearchBar";
import { CandidateList } from "../components/search/CandidateList";
import { useSearchStore } from "../stores/searchStore";

export function LookupPage() {
  const query = useSearchStore((s) => s.query);
  const articles = useSearchStore((s) => s.articles);
  const currentWord = useSearchStore((s) => s.currentWord);
  const isLoadingArticles = useSearchStore((s) => s.isLoadingArticles);

  const hasContent = query.trim().length > 0;

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
          {/* Candidate list */}
          <aside className="flex w-[280px] shrink-0 flex-col border-r border-border">
            <CandidateList />
          </aside>

          {/* Article area — placeholder until Phase 3 */}
          <section className="flex-1 overflow-y-auto px-6 py-4">
            {isLoadingArticles ? (
              <div className="space-y-4">
                <div className="h-6 w-48 animate-pulse rounded bg-surface-sunken" />
                <div className="h-4 w-full animate-pulse rounded bg-surface-sunken" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-surface-sunken" />
                <div className="h-4 w-3/5 animate-pulse rounded bg-surface-sunken" />
              </div>
            ) : articles.length > 0 ? (
              <div className="space-y-6">
                {articles.map((article, i) => (
                  <div key={`${article.dict_name}-${i}`}>
                    <h3 className="mb-2 text-[1.2rem] font-semibold text-text-primary">
                      {article.dict_name}
                    </h3>
                    <div className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-4">
                      <div
                        className="prose max-w-[75ch] text-text-primary"
                        dangerouslySetInnerHTML={{ __html: article.html }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : currentWord ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-text-tertiary">
                  No definition available
                </p>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
