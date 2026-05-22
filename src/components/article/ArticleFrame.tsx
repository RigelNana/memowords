import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchStore } from "../../stores/searchStore";
import { api } from "../../lib/tauri";

interface ArticleFrameProps {
  html: string;
  dictId: string;
  customCss?: string;
  customJs?: string;
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
    overflow: hidden;
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

export function ArticleFrame({ html, dictId, customCss, customJs, className }: ArticleFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lookup = useSearchStore((s) => s.lookup);
  const [processedDoc, setProcessedDoc] = useState<string>("");

  // Detect if article HTML itself contains <script> tags
  const hasScripts = /<script[\s>]/i.test(html) || !!customJs;

  // Async HTML processing: rewrite URLs + inline external scripts from MDD
  const processHtml = useCallback(
    async (rawHtml: string): Promise<string> => {
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

      // Inline external <script src="..."> from MDD/local (GoldenDict approach)
      // srcDoc iframes can't reliably load custom-protocol scripts, so inline them
      const scriptSrcRe = /<script([^>]*)\ssrc=["'](?!https?:\/\/|data:)([^"']+)["']([^>]*)>(\s*<\/script>)?/gi;
      const scriptMatches = [...processed.matchAll(scriptSrcRe)];
      for (const match of scriptMatches) {
        const srcPath = match[2];
        try {
          const data = await api.getResource(dictId, srcPath);
          if (data) {
            const jsText = new TextDecoder().decode(new Uint8Array(data));
            processed = processed.replace(match[0], `<script>${jsText}<\/script>`);
          }
        } catch {
          // Script load failed — remove the broken tag
          processed = processed.replace(match[0], `<!-- failed to load: ${srcPath} -->`);
        }
      }

      // Inline external <link rel="stylesheet" href="..."> from MDD/local
      const linkCssRe = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']mdict:\/\/[^/]+\/([^"']+)["'][^>]*\/?>/gi;
      const cssMatches = [...processed.matchAll(linkCssRe)];
      for (const match of cssMatches) {
        const cssPath = match[1];
        try {
          const data = await api.getResource(dictId, cssPath);
          if (data) {
            const cssText = new TextDecoder().decode(new Uint8Array(data));
            processed = processed.replace(match[0], `<style>${cssText}</style>`);
          }
        } catch {
          // CSS load failed — keep original (protocol handler may still work)
        }
      }

      const customStyle = customCss ? `<style>${customCss}</style>` : "";
      const customScript = customJs ? `<script>${customJs}<\/script>` : "";

      return `<!DOCTYPE html><html><head>${BASE_STYLES}${customStyle}</head><body>${processed}${customScript}</body></html>`;
    },
    [dictId, customCss, customJs],
  );

  // Run async processing whenever html/deps change
  useEffect(() => {
    let cancelled = false;
    processHtml(html).then((doc) => {
      if (!cancelled) setProcessedDoc(doc);
    });
    return () => { cancelled = true; };
  }, [html, processHtml]);

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
  }, [processedDoc]);

  if (!processedDoc) return null;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={processedDoc}
      sandbox={hasScripts ? "allow-same-origin allow-scripts" : "allow-same-origin"}
      className={`w-full border-0 ${className ?? ""}`}
      style={{ minHeight: 60 }}
      title="Dictionary article"
    />
  );
}
