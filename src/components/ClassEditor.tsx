import { useState } from "react";
import { PromptGenerator } from "./PromptGenerator";

/** Edit a list of class names, with optional generation from a description */
export function ClassEditor({
  classes,
  setClasses,
}: {
  classes: string[];
  setClasses: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

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

  const merge = (names: string[]) => {
    const merged = [...classes];
    for (const s of names) {
      if (!merged.some((c) => c.toLowerCase() === s.toLowerCase()))
        merged.push(s);
    }
    setClasses(merged);
  };

  return (
    <div className="space-y-4">
      <div className="border-border rounded-lg border p-3">
        <p className="mb-2 text-sm font-medium">Generate from a description</p>
        <PromptGenerator exclude={classes} onResult={merge} />
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
