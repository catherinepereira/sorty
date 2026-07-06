import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { DatasetSummaryStats } from "../types";
import { useConfirm } from "../hooks/useConfirm";
import { MergeIcon, PencilIcon, SparklesIcon, TrashIcon } from "./icons";
import { GenerateClassesDialog } from "./GenerateClassesDialog";
import { Select } from "./Select";
import { prettyClass } from "../classname";
import { humanBytes } from "../format";

/**
 * Inline dataset summary: headline counts, per-class and per-source breakdowns, size
 * range, and class management (delete a class or merge classes into a target). onChanged
 * fires after a class edit so the parent can reload the grid.
 */
export function SummaryPanel({
  datasetName,
  onChanged,
}: {
  datasetName: string;
  onChanged: () => void;
}) {
  const [stats, setStats] = useState<DatasetSummaryStats | null>(null);
  const load = () => api.getSummary(datasetName).then(setStats);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetName]);

  const afterEdit = () => {
    load();
    onChanged();
  };

  if (!stats) return <p className="text-muted">Loading</p>;

  return (
    <div className="space-y-5">
      <div className="flex gap-6 text-sm">
        <Stat label="Images" value={stats.total} />
        <Stat label="Classes" value={stats.subjects} />
        <Stat label="On disk" value={humanBytes(stats.bytes_total)} />
      </div>

      <ClassManager
        datasetName={datasetName}
        classes={stats.per_class}
        onChanged={afterEdit}
      />

      <SourceManager
        datasetName={datasetName}
        sources={stats.per_source}
        onChanged={afterEdit}
      />
    </div>
  );
}

function SourceManager({
  datasetName,
  sources,
  onChanged,
}: {
  datasetName: string;
  sources: { name: string; count: number }[];
  onChanged: () => void;
}) {
  const { ask, element } = useConfirm();
  const [busy, setBusy] = useState(false);

  const deleteSource = async (name: string, count: number) => {
    const ok = await ask({
      title: `Delete from "${name}"`,
      message: `Move all ${count} image${count === 1 ? "" : "s"} from "${name}" to the recycle bin?`,
      confirmLabel: "Delete images",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteSource(datasetName, name);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Per source</h3>
      <div className="space-y-1">
        {sources.map((s) => (
          <div
            key={s.name}
            className="hover:bg-bg flex items-center gap-2 rounded px-1 py-1 text-sm"
          >
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-muted">{s.count}</span>
            <button
              onClick={() => deleteSource(s.name, s.count)}
              disabled={busy}
              className="text-muted hover:text-bad p-1 disabled:opacity-40"
              title={`Delete all ${s.name} images`}
              aria-label={`Delete all ${s.name} images`}
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
      {element}
    </div>
  );
}

function ClassManager({
  datasetName,
  classes,
  onChanged,
}: {
  datasetName: string;
  classes: { name: string; count: number }[];
  onChanged: () => void;
}) {
  const { ask, element } = useConfirm();
  const [merging, setMerging] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newClass, setNewClass] = useState("");
  const [error, setError] = useState("");
  const [genOpen, setGenOpen] = useState(false);

  const names = classes.map((c) => c.name);

  const toggleMerge = (name: string) => {
    const next = new Set(merging);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setMerging(next);
    if (target && !next.has(target)) return;
    if (next.has(target)) setTarget("");
  };

  const deleteClass = async (name: string, count: number) => {
    const pretty = prettyClass(name);
    const ok = await ask({
      title: `Delete "${pretty}"`,
      message: `Delete all ${count} image${count === 1 ? "" : "s"} in "${pretty}" and remove the class? The folder goes to your computer's recycle bin.`,
      confirmLabel: "Delete class",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteClass(datasetName, name);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const runMerge = async () => {
    const sources = [...merging].filter((s) => s !== target);
    if (!sources.length || !target) return;
    setBusy(true);
    try {
      await api.mergeClasses(datasetName, sources, target);
      setMerging(new Set());
      setTarget("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (name: string) => {
    setEditing(name);
    setEditValue(prettyClass(name));
    setError("");
  };

  const saveRename = async () => {
    const next = editValue.trim();
    if (!editing || !next || next === editing) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.renameClass(datasetName, editing, next);
      setEditing(null);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not rename the class");
    } finally {
      setBusy(false);
    }
  };

  const addClass = async () => {
    const next = newClass.trim();
    if (!next) return;
    await addMany([next]);
    setNewClass("");
  };

  const addMany = async (additions: string[]) => {
    const have = new Set(names.map((n) => n.toLowerCase()));
    const fresh = additions.filter((a) => a.trim() && !have.has(a.toLowerCase()));
    if (!fresh.length) return;
    setBusy(true);
    setError("");
    try {
      await api.setSubjects(datasetName, [...names, ...fresh]);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">
        Classes <span className="text-muted">({classes.length})</span>
      </h3>
      <div className="space-y-1">
        {classes.map((c) => (
          <div
            key={c.name}
            className="hover:bg-bg flex items-center gap-2 rounded px-1 py-1 text-sm"
          >
            <input
              type="checkbox"
              className="accent-primary"
              checked={merging.has(c.name)}
              onChange={() => toggleMerge(c.name)}
              aria-label={`Select ${prettyClass(c.name)} to merge`}
            />
            {editing === c.name ? (
              <input
                autoFocus
                className="border-border focus:border-primary flex-1 rounded border px-2 py-0.5 text-sm outline-none"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename();
                  if (e.key === "Escape") setEditing(null);
                }}
                onBlur={saveRename}
              />
            ) : (
              <span className="flex-1 truncate">{prettyClass(c.name)}</span>
            )}
            <span className="text-muted">{c.count}</span>
            <button
              onClick={() => startEdit(c.name)}
              disabled={busy}
              className="text-muted hover:text-primary p-1 disabled:opacity-40"
              title={`Rename ${prettyClass(c.name)}`}
              aria-label={`Rename ${prettyClass(c.name)}`}
            >
              <PencilIcon />
            </button>
            <button
              onClick={() => deleteClass(c.name, c.count)}
              disabled={busy}
              className="text-muted hover:text-bad p-1 disabled:opacity-40"
              title={`Delete ${prettyClass(c.name)}`}
              aria-label={`Delete ${prettyClass(c.name)}`}
            >
              <TrashIcon />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-2 px-1 py-1 text-sm">
          <input
            className="border-border focus:border-primary flex-1 rounded border px-2 py-1 outline-none"
            placeholder="Add a class"
            value={newClass}
            onChange={(e) => setNewClass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClass()}
          />
          <button
            onClick={addClass}
            disabled={busy || !newClass.trim()}
            className="bg-primary rounded-lg px-3 py-1 font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
          <button
            onClick={() => setGenOpen(true)}
            disabled={busy}
            className="border-border hover:border-primary hover:text-primary flex items-center gap-1 rounded-lg border px-3 py-1 font-medium disabled:opacity-40"
            title="Generate classes from a prompt"
          >
            <SparklesIcon className="h-4 w-4" />
            Generate
          </button>
        </div>
      </div>

      {error && <p className="text-bad mt-2 text-sm">{error}</p>}

      <GenerateClassesDialog
        open={genOpen}
        datasetName={datasetName}
        current={names}
        onClose={() => setGenOpen(false)}
        onAdd={addMany}
      />

      {merging.size >= 1 && (
        <div className="border-border mt-3 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <MergeIcon className="text-primary h-4 w-4" />
          <span>
            Merge {merging.size} class{merging.size === 1 ? "" : "es"} into
          </span>
          <Select
            className="w-40"
            value={target}
            placeholder="Choose target"
            options={names.map((n) => ({ value: n, label: prettyClass(n) }))}
            onChange={setTarget}
          />
          <button
            onClick={runMerge}
            disabled={busy || !target || merging.size < 1 || (merging.size === 1 && merging.has(target))}
            className="bg-primary rounded-lg px-3 py-1.5 font-medium text-white disabled:opacity-40"
          >
            Merge
          </button>
        </div>
      )}
      {element}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-muted">{label}</div>
    </div>
  );
}

