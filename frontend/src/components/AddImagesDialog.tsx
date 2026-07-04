import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../api";

/**
 * Pull more images for existing classes. An empty class selection means all classes.
 * Fetches deeper pages and skips URLs already downloaded, so repeated runs keep adding.
 */
export function AddImagesDialog({
  open,
  classes,
  onClose,
  onStart,
}: {
  open: boolean;
  classes: string[];
  onClose: () => void;
  onStart: (body: {
    subjects?: string[];
    sources: string[];
    per_subject: number;
  }) => void;
}) {
  const [sources, setSources] = useState<string[]>([]);
  const [chosenSources, setChosenSources] = useState<Set<string>>(new Set());
  const [chosenClasses, setChosenClasses] = useState<Set<string>>(new Set());
  const [perSubject, setPerSubject] = useState(20);

  useEffect(() => {
    if (!open) return;
    api.sources().then((r) => {
      setSources(r.sources);
      setChosenSources(new Set(r.sources.slice(0, 1)));
    });
    setChosenClasses(new Set());
  }, [open]);

  const toggle = (
    set: Set<string>,
    key: string,
    setter: (s: Set<string>) => void,
  ) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const start = () => {
    onStart({
      subjects: chosenClasses.size ? [...chosenClasses] : undefined,
      sources: [...chosenSources],
      per_subject: perSubject,
    });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">Add more images</h2>

      <div className="mt-4">
        <p className="text-sm font-medium">
          Classes{" "}
          <span className="text-muted">
            {chosenClasses.size ? `(${chosenClasses.size})` : "(all)"}
          </span>
        </p>
        <div className="mt-1 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
          {classes.map((c) => (
            <button
              key={c}
              onClick={() => toggle(chosenClasses, c, setChosenClasses)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                chosenClasses.has(c)
                  ? "bg-primary text-white"
                  : "border-border text-muted border"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium">Sources</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => toggle(chosenSources, s, setChosenSources)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                chosenSources.has(s)
                  ? "bg-primary text-white"
                  : "border-border text-muted border"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <label className="text-muted mt-4 flex items-center gap-2 text-sm">
        New images per class
        <input
          type="number"
          min={1}
          max={100}
          className="border-border w-20 rounded-lg border px-2 py-1"
          value={perSubject}
          onChange={(e) => setPerSubject(Number(e.target.value))}
        />
      </label>

      <div className="mt-6 flex justify-end gap-3">
        <button
          className="text-muted hover:text-text px-4 py-2"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="bg-primary rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
          disabled={chosenSources.size === 0}
          onClick={start}
        >
          Add images
        </button>
      </div>
    </Modal>
  );
}
