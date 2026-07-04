import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../api";

export function GenerateDialog({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (body: {
    subjects?: string[];
    prompt?: string;
    count?: number;
    sources: string[];
    limit: number;
  }) => void;
}) {
  const [sources, setSources] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"prompt" | "subjects">("prompt");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(8);
  const [subjectText, setSubjectText] = useState("");
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    if (!open) return;
    api.sources().then((r) => {
      setSources(r.sources);
      setChosen(new Set(r.sources.slice(0, 1)));
    });
  }, [open]);

  const toggleSource = (s: string) => {
    const next = new Set(chosen);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setChosen(next);
  };

  const start = () => {
    const base = { sources: [...chosen], limit };
    if (mode === "prompt") onStart({ ...base, prompt, count });
    else {
      const subjects = subjectText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      onStart({ ...base, subjects });
    }
  };

  const ready =
    chosen.size > 0 &&
    (mode === "prompt"
      ? prompt.trim().length > 0
      : subjectText.trim().length > 0);

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">Generate images</h2>

      <div className="mt-4 flex gap-2 text-sm">
        <button
          className={`rounded-lg px-3 py-1.5 ${mode === "prompt" ? "bg-primary text-white" : "text-muted"}`}
          onClick={() => setMode("prompt")}
        >
          From a prompt
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 ${mode === "subjects" ? "bg-primary text-white" : "text-muted"}`}
          onClick={() => setMode("subjects")}
        >
          List subjects
        </button>
      </div>

      {mode === "prompt" ? (
        <div className="mt-3 space-y-3">
          <input
            className="border-border focus:border-primary w-full rounded-lg border px-3 py-2 outline-none"
            placeholder="e.g. common backyard birds of the Pacific Northwest"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <label className="text-muted flex items-center gap-2 text-sm">
            Subjects to resolve
            <input
              type="number"
              min={1}
              max={50}
              className="border-border w-20 rounded-lg border px-2 py-1"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
        </div>
      ) : (
        <textarea
          className="border-border focus:border-primary mt-3 w-full resize-none rounded-lg border px-3 py-2 outline-none"
          rows={3}
          placeholder="One subject per line, or comma-separated"
          value={subjectText}
          onChange={(e) => setSubjectText(e.target.value)}
        />
      )}

      <div className="mt-4">
        <p className="text-sm font-medium">Sources</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => toggleSource(s)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                chosen.has(s)
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
        Images per subject
        <input
          type="number"
          min={1}
          max={100}
          className="border-border w-20 rounded-lg border px-2 py-1"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
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
          disabled={!ready}
          onClick={start}
        >
          Generate
        </button>
      </div>
    </Modal>
  );
}
