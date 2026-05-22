import { ChevronDown } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

export function Select({ value, options, onChange, className }: SelectProps) {
  return (
    <div className={`relative inline-flex ${className ?? ""}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full cursor-pointer appearance-none rounded-[var(--radius-sm)] border border-border bg-surface-base pl-3 pr-8 text-sm text-text-primary outline-none transition-colors duration-[var(--duration-fast)] hover:border-text-tertiary focus:border-accent"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary"
      />
    </div>
  );
}
