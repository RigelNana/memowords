interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h2>
      <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
        {children}
      </div>
    </section>
  );
}
