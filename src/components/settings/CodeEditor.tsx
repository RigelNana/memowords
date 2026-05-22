import { useCallback, useEffect, useRef, useState } from "react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: "css" | "javascript";
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

export function CodeEditor({
  value,
  onChange,
  language = "css",
  placeholder,
  disabled,
  minHeight = 120,
  maxHeight = 300,
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineCountRef = useRef<HTMLDivElement>(null);
  const [lineCount, setLineCount] = useState(1);

  // Sync line count
  useEffect(() => {
    const lines = value.split("\n").length;
    setLineCount(Math.max(lines, 1));
  }, [value]);

  // Sync scroll between textarea and line numbers
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineCountRef.current) {
      lineCountRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Handle tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          value.substring(0, start) + "  " + value.substring(end);
        onChange(newValue);

        // Restore cursor position
        requestAnimationFrame(() => {
          textarea.selectionStart = start + 2;
          textarea.selectionEnd = start + 2;
        });
      }

      // Cmd+S to save (bubble to parent)
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        // Parent should handle save via onSave prop or similar
      }
    },
    [value, onChange],
  );

  return (
    <div
      className={[
        "relative flex overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-sunken font-mono text-[13px] leading-5",
        "transition-colors duration-[var(--duration-fast)]",
        "focus-within:border-accent",
        disabled ? "opacity-50" : "",
      ].join(" ")}
      style={{ minHeight, maxHeight }}
    >
      {/* Line numbers */}
      <div
        ref={lineCountRef}
        className="pointer-events-none flex w-10 shrink-0 flex-col overflow-hidden border-r border-border px-2 pt-3 text-right text-text-tertiary"
        aria-hidden
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <span key={i} className="leading-5">
            {i + 1}
          </span>
        ))}
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder ?? `/* ${language} */`}
        spellCheck={false}
        className="flex-1 resize-y bg-transparent p-3 text-text-primary outline-none placeholder:text-text-tertiary disabled:pointer-events-none"
        style={{ minHeight, maxHeight, tabSize: 2 }}
      />
    </div>
  );
}
