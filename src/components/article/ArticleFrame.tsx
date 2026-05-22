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

function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    aac: "audio/aac",
    spx: "audio/ogg",
  };
  return map[ext] ?? "application/octet-stream";
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function ArticleFrame({ html, dictId, customCss, customJs, className }: ArticleFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lookup = useSearchStore((s) => s.lookup);
  const [processedDoc, setProcessedDoc] = useState<string>("");

  // Async HTML processing: rewrite URLs + inline external scripts from MDD
  const processHtml = useCallback(
    async (rawHtml: string): Promise<string> => {
      let processed = rawHtml;

      // Rewrite link href (CSS) to mdict:// (will be inlined below)
      processed = processed.replace(
        /(<link[^>]+href=")(?!https?:\/\/|data:|mdict:\/\/)([^"]+)(")/gi,
        `$1mdict://${dictId}/$2$3`,
      );

      // Map data-src-mp3 / data-src-ogg to data-audio-src (used by OALD, LDOCE, etc.)
      processed = processed.replace(
        /<a\b([^>]*)\bdata-src-mp3=["']([^"']+)["']([^>]*)>/gi,
        (full, before, mp3Path, after) => {
          const cleanPath = mp3Path.replace(/^\//, "");
          if (full.includes("data-audio-src")) return full;
          return `<a${before}data-src-mp3="${mp3Path}" data-audio-src="${cleanPath}"${after}>`;
        },
      );

      // Rewrite sound:// links to data-audio-src (avoids sandbox blocking mdict:// navigation)
      const audioLinkExts = /\.(mp3|ogg|wav|aac|spx)$/i;
      // sound:// in href → data-audio-src
      processed = processed.replace(
        /(<a\b[^>]*)\bhref=["']sound:\/\/([^"']+)["']/gi,
        (full, before, path) => {
          if (audioLinkExts.test(path)) {
            return `${before}href="javascript:void(0)" data-audio-src="${path}" onclick="return false"`;
          }
          return full;
        },
      );
      // mdict:// audio in href → data-audio-src
      processed = processed.replace(
        /(<a\b[^>]*)\bhref=["']mdict:\/\/[^/]+\/([^"']+)["']/gi,
        (full, before, path) => {
          if (audioLinkExts.test(path)) {
            return `${before}href="javascript:void(0)" data-audio-src="${path}" onclick="return false"`;
          }
          return full;
        },
      );
      // Rewrite sound:// in img src to mdict:// (non-audio, non-link contexts)
      processed = processed.replace(
        /(<img[^>]+src=["'])sound:\/\/([^"']+)(["'])/gi,
        `$1mdict://${dictId}/$2$3`,
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
          } else {
            // Resource not found — remove the broken tag
            processed = processed.replace(match[0], `<!-- not found: ${srcPath} -->`);
          }
        } catch {
          // Script load failed — remove the broken tag
          processed = processed.replace(match[0], `<!-- failed to load: ${srcPath} -->`);  
        }
      }

      // Inline external <link stylesheet> from MDD/local (handles both attr orders)
      const linkCssRe = /<link[^>]*(?:rel=["']stylesheet["'][^>]*href=["']mdict:\/\/[^/]+\/([^"']+)["']|href=["']mdict:\/\/[^/]+\/([^"']+)["'][^>]*rel=["']stylesheet["'])[^>]*\/?>/gi;
      const cssMatches = [...processed.matchAll(linkCssRe)];
      for (const match of cssMatches) {
        const cssPath = match[1] || match[2];
        try {
          const data = await api.getResource(dictId, cssPath);
          if (data) {
            const cssText = new TextDecoder().decode(new Uint8Array(data));
            processed = processed.replace(match[0], `<style>${cssText}</style>`);
          } else {
            processed = processed.replace(match[0], `<!-- css not found: ${cssPath} -->`);
          }
        } catch {
          processed = processed.replace(match[0], `<!-- css failed: ${cssPath} -->`);
        }
      }

      // Remove any remaining <link> with mdict:// href (can't load in srcDoc)
      processed = processed.replace(/<link[^>]+href=["']mdict:\/\/[^"']+["'][^>]*\/?>/gi, "");

      // Inline images as data: URLs — srcDoc iframes can't load mdict:// protocol
      const imgSrcRe = /<img([^>]*)\ssrc=["'](?:mdict:\/\/[^/]+\/|(?!https?:\/\/|data:))([^"']+)["']([^>]*)>/gi;
      const imgMatches = [...processed.matchAll(imgSrcRe)];
      for (const match of imgMatches) {
        const imgPath = match[2];
        try {
          const data = await api.getResource(dictId, imgPath);
          if (data) {
            const bytes = new Uint8Array(data);
            const mime = guessMimeType(imgPath);
            const base64 = uint8ToBase64(bytes);
            processed = processed.replace(
              match[0],
              `<img${match[1]} src="data:${mime};base64,${base64}"${match[3]}>`,
            );
          }
        } catch {
          // Image load failed — leave broken (will show alt text)
        }
      }

      // Inline audio src as data: URLs — same srcDoc limitation
      const audioSrcRe = /(<(?:audio|source)[^>]*\ssrc=")(?:mdict:\/\/[^/]+\/|(?!https?:\/\/|data:))([^"]+)(")/gi;
      const audioMatches = [...processed.matchAll(audioSrcRe)];
      for (const match of audioMatches) {
        const audioPath = match[2];
        try {
          const data = await api.getResource(dictId, audioPath);
          if (data) {
            const bytes = new Uint8Array(data);
            const mime = guessMimeType(audioPath);
            const base64 = uint8ToBase64(bytes);
            processed = processed.replace(
              match[0],
              `${match[1]}data:${mime};base64,${base64}${match[3]}`,
            );
          }
        } catch {
          // Audio load failed — leave as-is
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

  // Handle link clicks inside iframe (entry://, mdict:// audio, http)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function handleLoad() {
      const doc = iframe!.contentDocument;
      if (!doc) return;

      // Use capture phase so we intercept before dictionary's own handlers
      doc.addEventListener("click", (e) => {
        const target = (e.target as HTMLElement).closest("a[data-audio-src]") || (e.target as HTMLElement).closest("a");
        if (!target) return;

        const href = target.getAttribute("href") || "";
        const audioSrc = target.getAttribute("data-audio-src")
          || target.getAttribute("data-src-mp3")?.replace(/^\//, "")
          || target.getAttribute("data-src-ogg")?.replace(/^\//, "")
          || null;

        if (audioSrc) {
          // Audio link: load via Tauri IPC and play
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          api.getResource(dictId, audioSrc).then((data) => {
            if (!data) return;
            const bytes = new Uint8Array(data);
            const mime = guessMimeType(audioSrc);
            const blob = new Blob([bytes], { type: mime });
            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);
            audio.play().catch(() => {});
            audio.addEventListener("ended", () => URL.revokeObjectURL(blobUrl));
          }).catch(() => {});
        } else if (href.startsWith("entry://")) {
          e.preventDefault();
          const word = decodeURIComponent(href.slice("entry://".length));
          lookup(word);
        } else if (href.startsWith("http://") || href.startsWith("https://")) {
          e.preventDefault();
          window.open(href, "_blank");
        }
      }, true); // capture phase
    }

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [lookup, dictId]);

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

  return (
    <iframe
      ref={iframeRef}
      srcDoc={processedDoc || ""}
      sandbox="allow-same-origin allow-scripts"
      className={`w-full border-0 ${className ?? ""}`}
      style={{ minHeight: 60, display: processedDoc ? undefined : "none" }}
      title="Dictionary article"
    />
  );
}
