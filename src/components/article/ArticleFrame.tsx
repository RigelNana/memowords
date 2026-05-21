import { useCallback, useEffect, useRef } from "react";
import { useSearchStore } from "../../stores/searchStore";

interface ArticleFrameProps {
  html: string;
  dictId: string;
  className?: string;
}

const BASE_STYLES = `
<style>
  :root {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: oklch(0.205 0.012 270);
    -webkit-font-smoothing: antialiased;
  }
  body {
    margin: 0;
    padding: 16px 20px;
    max-width: 75ch;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  img {
    max-width: 100%;
    height: auto;
  }
  a {
    color: oklch(0.545 0.18 280);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  td, th {
    border: 1px solid oklch(0.905 0.01 270);
    padding: 4px 8px;
  }
</style>
`;

export function ArticleFrame({ html, dictId, className }: ArticleFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lookup = useSearchStore((s) => s.lookup);

  // Rewrite relative resource URLs to mdict:// protocol
  const processHtml = useCallback(
    (rawHtml: string) => {
      let processed = rawHtml;

      // Rewrite img src
      processed = processed.replace(
        /(<img[^>]+src=")(?!https?:\/\/|data:|mdict:\/\/)([^"]+)(")/gi,
        `$1mdict://${dictId}/$2$3`,
      );

      // Rewrite link href (CSS)
      processed = processed.replace(
        /(<link[^>]+href=")(?!https?:\/\/|data:|mdict:\/\/)([^"]+)(")/gi,
        `$1mdict://${dictId}/$2$3`,
      );

      // Rewrite sound:// to mdict://
      processed = processed.replace(
        /sound:\/\//gi,
        `mdict://${dictId}/`,
      );

      return `<!DOCTYPE html><html><head>${BASE_STYLES}</head><body>${processed}</body></html>`;
    },
    [dictId],
  );

  // Handle link clicks inside iframe (entry:// protocol)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function handleLoad() {
      const doc = iframe!.contentDocument;
      if (!doc) return;

      doc.addEventListener("click", (e) => {
        const target = (e.target as HTMLElement).closest("a");
        if (!target) return;

        const href = target.getAttribute("href") || "";

        if (href.startsWith("entry://")) {
          e.preventDefault();
          const word = decodeURIComponent(href.slice("entry://".length));
          lookup(word);
        } else if (href.startsWith("http://") || href.startsWith("https://")) {
          e.preventDefault();
          // Open external links in system browser (Tauri shell)
          window.open(href, "_blank");
        }
      });
    }

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [lookup]);

  // Auto-resize iframe to content height
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function resize() {
      const doc = iframe!.contentDocument;
      if (!doc?.body) return;
      iframe!.style.height = doc.body.scrollHeight + "px";
    }

    iframe.addEventListener("load", resize);

    // Also resize on mutations (images loading, etc.)
    const observer = new MutationObserver(resize);
    const intervalCheck = setInterval(() => {
      const doc = iframe.contentDocument;
      if (doc?.body) {
        observer.observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
        });
        resize();
        clearInterval(intervalCheck);
      }
    }, 100);

    return () => {
      iframe.removeEventListener("load", resize);
      observer.disconnect();
      clearInterval(intervalCheck);
    };
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={processHtml(html)}
      sandbox="allow-same-origin"
      className={`w-full border-0 ${className ?? ""}`}
      style={{ minHeight: 60 }}
      title="Dictionary article"
    />
  );
}
