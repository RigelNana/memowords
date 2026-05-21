import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ArticleFrame } from "./ArticleFrame";

interface DictSectionProps {
  dictName: string;
  dictId: string;
  html: string;
  id?: string;
}

export function DictSection({ dictName, dictId, html, id }: DictSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

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
            <ArticleFrame html={html} dictId={dictId} />
          </div>
        </div>
      </div>
    </section>
  );
}
