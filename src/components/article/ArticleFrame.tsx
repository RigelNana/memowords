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

// MIME type lookup by file extension
function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    svg: "image/svg+xml", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon",
    tif: "image/tiff", tiff: "image/tiff",
    css: "text/css", js: "application/javascript",
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", spx: "audio/x-speex",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", eot: "application/vnd.ms-fontobject",
  };
  return map[ext] || "application/octet-stream";
}

// Convert Uint8Array to base64 string
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

  // Async HTML processing: inline all resources as data URIs.
  // srcDoc iframes cannot load custom-protocol URLs (mdict://),
  // so we fetch every resource via Tauri IPC and embed inline.
  const processHtml = useCallback(
    async (rawHtml: string): Promise<string> => {
      let processed = rawHtml;

      // Rewrite sound:// to a relative path (will be inlined below)
      processed = processed.replace(/sound:\/\//gi, "");

      // ── Helper: load resource and encode as data URI ──
      async function toDataUri(resourcePath: string): Promise<string | null> {
        try {
          const data = await api.getResource(dictId, resourcePath);
          if (!data) return null;
          const bytes = new Uint8Array(data);
          const mime = guessMime(resourcePath);
          const base64 = uint8ToBase64(bytes);
          return `data:${mime};base64,${base64}`;
        } catch {
          return null;
        }
      }

      // ── Inline <img src="..."> ──
      const imgRe = /(<img[^>]+src=["'])(?!https?:\/\/|data:)([^"']+)(["'])/gi;
      const imgMatches = [...processed.matchAll(imgRe)];
      for (const m of imgMatches) {
        const uri = await toDataUri(m[2]);
        if (uri) {
          processed = processed.replace(m[0], `${m[1]}${uri}${m[3]}`);
        }
      }

      // ── Inline <link rel="stylesheet" href="..."> ──
      const linkRe = /<link[^>]+rel=["']stylesheet["'][^>]+href=["'](?!https?:\/\/|data:)([^"']+)["'][^>]*\/?>/gi;
      const linkMatches = [...processed.matchAll(linkRe)];
      for (const m of linkMatches) {
        try {
          const data = await api.getResource(dictId, m[1]);
          if (data) {
            const cssText = new TextDecoder().decode(new Uint8Array(data));
            processed = processed.replace(m[0], `<style>${cssText}</style>`);
          }
        } catch { /* skip */ }
      }

      // ── Inline <script src="..."> ──
      const scriptRe = /<script([^>]*)\ssrc=["'](?!https?:\/\/|data:)([^"']+)["']([^>]*)>(\s*<\/script>)?/gi;
      const scriptMatches = [...processed.matchAll(scriptRe)];
      for (const m of scriptMatches) {
        try {
          const data = await api.getResource(dictId, m[2]);
          if (data) {
            const jsText = new TextDecoder().decode(new Uint8Array(data));
            processed = processed.replace(m[0], `<script>${jsText}<\/script>`);
          }
        } catch {
          processed = processed.replace(m[0], `<!-- failed: ${m[2]} -->`);
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
