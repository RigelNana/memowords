interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-[200ms]",
        checked ? "bg-accent" : "bg-surface-sunken",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
      style={{
        transition:
          "background-color 200ms cubic-bezier(0.25, 1, 0.5, 1)",
      }}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 rounded-full shadow-sm",
          checked ? "bg-white" : "bg-text-tertiary",
        ].join(" ")}
        style={{
          transform: checked ? "translateX(18px)" : "translateX(2px)",
          transition:
            "transform 200ms cubic-bezier(0.25, 1, 0.5, 1), background-color 200ms cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      />
    </button>
  );
}
