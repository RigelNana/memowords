import { useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ConfirmPopoverProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  children: React.ReactNode;
}

export function ConfirmPopover({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  children,
}: ConfirmPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  const handleConfirm = useCallback(() => {
    onConfirm();
    onClose();
  }, [onConfirm, onClose]);

  const isDanger = variant === "danger";

  return (
    <div ref={containerRef} className="relative inline-block">
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-20 mt-1 w-56 rounded-[var(--radius-md)] border border-border bg-surface-overlay p-3"
          >
            <p className="text-sm font-medium text-text-primary">{title}</p>
            {description && (
              <p className="mt-1 text-xs text-text-secondary">{description}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken"
              >
                {cancelLabel}
              </button>
              <button
                onClick={handleConfirm}
                className={[
                  "flex-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
                  isDanger
                    ? "bg-error/10 text-error hover:bg-error/20"
                    : "bg-accent text-white hover:bg-accent/90",
                ].join(" ")}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
