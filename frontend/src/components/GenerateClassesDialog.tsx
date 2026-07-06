import { useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { api, ApiError } from "../api";
import { SparklesIcon } from "./icons";

/**
 * Resolve classes from a prompt via the LLM, deduped against the current set, and let
 * the user pick which to add. onAdd receives the chosen names. The resolve endpoint is
 * given the existing classes as exclude, so it only returns new ones.
 */
export function GenerateClassesDialog({
  open,
  datasetName,
  current,
  onClose,
  onAdd,
}: {
  open: boolean;
  datasetName: string;
  current: string[];
  onClose: () => void;
  onAdd: (names: string[]) => Promise<void> | void;
}) {
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const reset = () => {
    setPrompt("");
    setResults(null);
    setChosen(new Set());
    setError("");
  };

  const close = () => {
    reset();
    onClose();
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { subjects } = await api.resolveSubjects(datasetName, {
        prompt,
        count,
        exclude: current,
      });
      // dedupe again on the client in case the model echoes an existing name
      const have = new Set(current.map((c) => c.toLowerCase()));
      const fresh = subjects.filter((s) => !have.has(s.toLowerCase()));
      setResults(fresh);
      setChosen(new Set(fresh));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate classes");
    } finally {
      setBusy(false);
    }
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

      <div className="mt-4 flex gap-2">
        <input
          autoFocus
          className="border-border focus:border-primary flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          placeholder="e.g. common backyard birds of the Pacific NW"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
        />
        <input
          type="number"
          min={1}
          max={50}
          className="border-border w-16 rounded-lg border px-2 py-1 text-sm"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <button
          onClick={generate}
          disabled={busy || !prompt.trim()}
          className="bg-primary rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy && !results ? "..." : "Generate"}
        </button>
      </div>

      {error && <p className="text-bad mt-2 text-sm">{error}</p>}

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
