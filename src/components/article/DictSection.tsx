import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ArticleFrame } from "./ArticleFrame";
import { api } from "../../lib/tauri";

interface DictSectionProps {
  dictName: string;
  dictId: string;
  html: string;
  id?: string;
}

export function DictSection({ dictName, dictId, html, id }: DictSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [customCss, setCustomCss] = useState<string | undefined>(undefined);
  const [customJs, setCustomJs] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      try {
        const config = await api.getDictConfig(dictId);

        // Load CSS from file paths if configured
        if (config.css_paths.length > 0) {
          const parts: string[] = [];
          for (const p of config.css_paths) {
            try {
              const cssData = await api.getResource(dictId, p);
              if (cssData) {
                parts.push(new TextDecoder().decode(new Uint8Array(cssData)));
              }
            } catch (e) {
              // CSS file load failed — skip silently
            }
          }
          if (parts.length > 0 && !cancelled) setCustomCss(parts.join("\n"));
        } else if (config.custom_css) {
          if (!cancelled) setCustomCss(config.custom_css);
        }

        // Load JS if enabled
        if (config.js_enabled) {
          if (config.js_paths.length > 0) {
            const parts: string[] = [];
            for (const p of config.js_paths) {
              try {
                const jsData = await api.getResource(dictId, p);
                if (jsData) {
                  parts.push(new TextDecoder().decode(new Uint8Array(jsData)));
                }
              } catch (e) {
                // JS file load failed — skip silently
              }
            }
            if (parts.length > 0 && !cancelled) setCustomJs(parts.join("\n"));
          } else if (config.custom_js) {
            if (!cancelled) setCustomJs(config.custom_js);
          }
        }
      } catch (e) {
        // Config load failed — skip silently
      }
    }
    loadConfig();
    return () => { cancelled = true; };
  }, [dictId]);

  return (
    <section id={id} className="border-b border-border last:border-b-0">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="sticky top-0 z-[2] flex h-11 w-full items-center gap-2 bg-surface-raised px-5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken"
      >
        <span className="flex-1 text-[1.2rem] font-semibold text-text-primary">
          {dictName}
        </span>
        <ChevronDown
          size={18}
          className="shrink-0 text-text-tertiary"
          style={{
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition:
              "transform 200ms cubic-bezier(0.25, 1, 0.5, 1)",
          }}
        />
      </button>

      {/* Content with grid collapse animation */}
      <div
        className="grid"
        style={{
          gridTemplateRows: collapsed ? "0fr" : "1fr",
          transition:
            "grid-template-rows 350ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="px-5 py-4">
            <ArticleFrame html={html} dictId={dictId} customCss={customCss} customJs={customJs} />
          </div>
        </div>
      </div>
    </section>
  );
}
