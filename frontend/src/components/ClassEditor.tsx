import { useState } from "react";
import { api, ApiError } from "../api";

/**
 * Edit a list of class names, with optional LLM generation from a prompt. Used by the
 * create flow and the add-classes action. datasetName drives the resolve endpoint, so
 * generation needs the dataset to exist first.
 */
export function ClassEditor({
  datasetName,
  classes,
  setClasses,
}: {
  datasetName: string;
  classes: string[];
  setClasses: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = (name: string) => {
    const trimmed = name.trim();
    if (
      trimmed &&
      !classes.some((c) => c.toLowerCase() === trimmed.toLowerCase())
    ) {
      setClasses([...classes, trimmed]);
    }
  };

  const addDraft = () => {
    // allow comma or newline separated entry
    draft
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach(add);
    setDraft("");
  };

  const remove = (name: string) =>
    setClasses(classes.filter((c) => c !== name));

  const edit = (i: number, value: string) => {
    const next = [...classes];
    next[i] = value;
    setClasses(next);
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { subjects } = await api.resolveSubjects(datasetName, {
        prompt,
        count,
        exclude: classes,
      });
      const merged = [...classes];
      for (const s of subjects) {
        if (!merged.some((c) => c.toLowerCase() === s.toLowerCase()))
          merged.push(s);
      }
      setClasses(merged);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not generate classes",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-border rounded-lg border p-3">
        <p className="text-sm font-medium">Generate with a prompt</p>
        <div className="mt-2 flex gap-2">
          <input
            className="border-border focus:border-primary flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            placeholder="e.g. common backyard birds of the Pacific NW"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
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
            {busy ? "..." : "Generate"}
          </button>
        </div>
        {error && <p className="text-bad mt-2 text-sm">{error}</p>}
      </div>

      <div className="flex gap-2">
        <input
          className="border-border focus:border-primary flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          placeholder="Add a class, or paste a comma-separated list"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addDraft()}
        />
        <button
          onClick={addDraft}
          className="border-border rounded-lg border px-3 py-2 text-sm"
        >
          Add
        </button>
      </div>

      {classes.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {classes.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="border-border focus:border-primary flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none"
                value={c}
                onChange={(e) => edit(i, e.target.value)}
              />
              <button
                onClick={() => remove(c)}
                className="text-muted hover:text-bad rounded px-2 py-1"
                aria-label={`Remove ${c}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-muted text-sm">
        {classes.length} class{classes.length === 1 ? "" : "es"}
      </p>
    </div>
  );
}
