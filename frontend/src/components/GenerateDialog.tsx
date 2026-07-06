import { useEffect, useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { api } from "../api";
import { prettyClass } from "../classname";

/**
 * Fetch images for a dataset. Pick specific classes or leave the picker empty for all,
 * choose how many to pull per class (added on top, or a total to top up to), and
 * optionally resolve brand-new classes from a prompt via the LLM. Repeated runs page
 * deeper and skip URLs already downloaded, so a fetch never silently no-ops.
 */
export function GenerateDialog({
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
    prompt?: string;
    class_count?: number;
    sources: string[];
    count: number;
    target_total: boolean;
  }) => void;
}) {
  const [sources, setSources] = useState<string[]>([]);
  const [chosenSources, setChosenSources] = useState<Set<string>>(new Set());
  const [chosenClasses, setChosenClasses] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(20);
  const [countMode, setCountMode] = useState<"add" | "total">("add");
  const [usePrompt, setUsePrompt] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [classCount, setClassCount] = useState(8);

  useEffect(() => {
    if (!open) return;
    api.sources().then((r) => {
      setSources(r.sources);
      setChosenSources(new Set(r.sources.slice(0, 1)));
    });
    setChosenClasses(new Set());
    setUsePrompt(false);
    setPrompt("");
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
      prompt: usePrompt && prompt.trim() ? prompt.trim() : undefined,
      class_count: usePrompt ? classCount : undefined,
      sources: [...chosenSources],
      count,
      target_total: countMode === "total",
    });
  };

  const noClassesYet = classes.length === 0;
  const ready =
    chosenSources.size > 0 &&
    (classes.length > 0 || (usePrompt && prompt.trim().length > 0));

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">Generate images</h2>

      {classes.length > 0 && (
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
                {prettyClass(c)}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={usePrompt}
          onChange={(e) => setUsePrompt(e.target.checked)}
        />
        {noClassesYet ? "Resolve classes from a prompt" : "Add new classes from a prompt"}
      </label>

      {usePrompt && (
        <div className="mt-2 space-y-3">
          <input
            className="border-border focus:border-primary w-full rounded-lg border px-3 py-2 outline-none"
            placeholder="e.g. common backyard birds of the Pacific Northwest"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <label className="text-muted flex items-center gap-2 text-sm">
            Classes to resolve
            <input
              type="number"
              min={1}
              max={50}
              className="border-border w-20 rounded-lg border px-2 py-1"
              value={classCount}
              onChange={(e) => setClassCount(Number(e.target.value))}
            />
          </label>
        </div>
      )}

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

      <div className="mt-4 space-y-2">
        <div className="flex gap-2 text-sm">
          <button
            className={`rounded-lg px-3 py-1.5 ${countMode === "add" ? "bg-primary text-white" : "text-muted"}`}
            onClick={() => setCountMode("add")}
          >
            Add per class
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 ${countMode === "total" ? "bg-primary text-white" : "text-muted"}`}
            onClick={() => setCountMode("total")}
          >
            Total per class
          </button>
        </div>
        <label className="text-muted flex items-center gap-2 text-sm">
          {countMode === "add" ? "New images per class" : "Target total per class"}
          <input
            type="number"
            min={1}
            max={200}
            className="border-border w-20 rounded-lg border px-2 py-1"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
      </div>

      <ModalActions
        actionLabel="Generate"
        disabled={!ready}
        onCancel={onClose}
        onAction={start}
      />
    </Modal>
  );
}
