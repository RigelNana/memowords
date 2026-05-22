import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDictStore } from "../stores/dictStore";
import { DictCard } from "../components/settings/DictCard";
import { api } from "../lib/tauri";

export function DictListPage() {
  const navigate = useNavigate();
  const dicts = useDictStore((s) => s.dicts);
  const loadDicts = useDictStore((s) => s.loadDicts);

  useEffect(() => {
    loadDicts();
  }, [loadDicts]);

  const handleEdit = useCallback(
    (id: string) => {
      navigate(`/settings/dicts/${id}`);
    },
    [navigate],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      try {
        await api.removeDict(id);
        loadDicts();
      } catch (e) {
        console.error("Failed to remove dict:", e);
      }
    },
    [loadDicts],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center gap-3 border-b border-border px-6">
        <button
          onClick={() => navigate("/settings")}
          className="rounded-[var(--radius-sm)] p-1 text-text-tertiary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken hover:text-text-primary"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-[1.2rem] font-semibold text-text-primary">
          Dictionaries
        </h1>
        <button
          onClick={() => navigate("/settings/dicts/import")}
          className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-3 text-sm font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90"
        >
          <Plus size={16} />
          Add Dictionary
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-[720px]">
          {dicts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <BookOpen
                size={48}
                className="mb-4 text-text-tertiary"
                strokeWidth={1}
              />
              <p className="text-base text-text-secondary">
                No dictionaries imported yet
              </p>
              <p className="mt-1 text-sm text-text-tertiary">
                Click "Add Dictionary" to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {dicts.map((dict) => (
                  <motion.div
                    key={dict.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{
                      duration: 0.25,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <DictCard
                      dict={dict}
                      onEdit={handleEdit}
                      onRemove={handleRemove}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
