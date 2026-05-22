import { useCallback, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { api } from "../../lib/tauri";
import { ArticleFrame } from "../article/ArticleFrame";

interface PreviewFrameProps {
  dictId: string;
  customCss?: string;
  customJs?: string;
}

export function PreviewFrame({
  dictId,
  customCss,
  customJs,
}: PreviewFrameProps) {
  const [word, setWord] = useState("apple");
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = useCallback(async () => {
    if (!word.trim()) return;
    setLoading(true);
    try {
      const articles = await api.lookup(word);
      const match = articles.find((a) => a.dict_id === dictId);
      setHtml(match?.html ?? null);
    } catch (e) {
      console.error("Preview failed:", e);
      setHtml(null);
    }
    setLoading(false);
  }, [word, dictId]);

  return (
    <div>
      {/* Input row */}
      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handlePreview()}
          placeholder="Preview word..."
          className="h-8 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface-base px-3 text-sm text-text-primary outline-none transition-colors duration-[var(--duration-fast)] focus:border-accent"
        />
        <button
          onClick={handlePreview}
          disabled={loading}
          className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 text-sm font-medium text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Eye size={14} />
          )}
          Preview
        </button>
      </div>

      {/* Preview area */}
      <div
        className="overflow-hidden rounded-[var(--radius-md)] border border-border"
        style={{ minHeight: 200, maxHeight: 400 }}
      >
        {html != null ? (
          <ArticleFrame
            html={html}
            dictId={dictId}
            customCss={customCss}
            customJs={customJs}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-sm text-text-tertiary">
              {loading
                ? "Loading..."
                : 'Enter a word and click "Preview"'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
