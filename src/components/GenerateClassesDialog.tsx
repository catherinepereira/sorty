import { useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { SparklesIcon } from "./icons";
import { PromptGenerator } from "./PromptGenerator";

/**
 * Generate classes from a description, deduped against the current set, and let the
 * user pick which to add. onAdd receives the chosen names
 */
export function GenerateClassesDialog({
  open,
  current,
  onClose,
  onAdd,
}: {
  open: boolean;
  current: string[];
  onClose: () => void;
  onAdd: (names: string[]) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const reset = () => {
    setResults(null);
    setChosen(new Set());
  };

  const close = () => {
    reset();
    onClose();
  };

  const showResults = (names: string[]) => {
    // dedupe again in case the model echoes an existing name
    const have = new Set(current.map((c) => c.toLowerCase()));
    const fresh = names.filter((s) => !have.has(s.toLowerCase()));
    setResults(fresh);
    setChosen(new Set(fresh));
  };

  const toggle = (name: string) => {
    const next = new Set(chosen);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setChosen(next);
  };

  const add = async () => {
    if (!chosen.size) return;
    setBusy(true);
    try {
      await onAdd([...chosen]);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <SparklesIcon className="text-primary h-5 w-5" />
        Generate classes
      </h2>

      <div className="mt-4">
        <PromptGenerator exclude={current} onResult={showResults} />
      </div>

      {results && (
        <div className="mt-4">
          {results.length === 0 ? (
            <p className="text-muted text-sm">
              No new classes, everything the model suggested is already in the
              list.
            </p>
          ) : (
            <>
              <p className="text-muted mb-2 text-sm">
                {chosen.size} of {results.length} selected
              </p>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {results.map((r) => (
                  <label
                    key={r}
                    className="hover:bg-bg flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={chosen.has(r)}
                      onChange={() => toggle(r)}
                    />
                    <span className="truncate">{r}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <ModalActions
        actionLabel={`Add ${chosen.size > 0 ? chosen.size : ""} class${chosen.size === 1 ? "" : "es"}`}
        disabled={busy || !chosen.size}
        onCancel={close}
        onAction={add}
      />
    </Modal>
  );
}
