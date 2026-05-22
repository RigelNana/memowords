import { ChevronRight } from "lucide-react";

interface SettingRowProps {
  label: string;
  description?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  suffix?: string;
}

export function SettingRow({
  label,
  description,
  children,
  onClick,
  suffix,
}: SettingRowProps) {
  const isLink = !!onClick;

  const content = (
    <>
      <div className="flex-1">
        <span className="text-base text-text-primary">{label}</span>
        {description && (
          <p className="text-xs text-text-tertiary">{description}</p>
        )}
      </div>
      {children}
      {suffix && (
        <span className="text-sm text-text-tertiary">{suffix}</span>
      )}
      {isLink && (
        <ChevronRight size={16} className="shrink-0 text-text-tertiary" />
      )}
    </>
  );

  if (isLink) {
    return (
      <button
        onClick={onClick}
        className="flex h-12 w-full items-center gap-3 px-4 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex h-12 items-center gap-3 px-4">{content}</div>
  );
}
