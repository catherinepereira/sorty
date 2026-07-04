import { useState } from "react";
import { Modal } from "./Modal";
import { api } from "../api";
import { useDataset } from "../stores/dataset";

/** Bin every image from one source. Source counts come from the loaded items in the store. */
export function DeleteSourceDialog({
  open,
  datasetName,
  onClose,
  onDeleted,
}: {
  open: boolean;
  datasetName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const items = useDataset((s) => s.detail?.items ?? []);
  const [busy, setBusy] = useState(false);

  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.source, (counts.get(i.source) ?? 0) + 1);
  const sources = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const del = async (source: string) => {
    setBusy(true);
    try {
      await api.deleteSource(datasetName, source);
      onDeleted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-md">
      <h2 className="text-lg font-semibold">Delete images by source</h2>
      <p className="text-muted mt-1 text-sm">
        Moves every image from a source to the recycle bin. Restore from there
        if needed.
      </p>
      <div className="mt-4 space-y-2">
        {sources.length === 0 && <p className="text-muted">No sources.</p>}
        {sources.map((s) => (
          <div
            key={s.name}
            className="border-border flex items-center justify-between rounded-lg border px-3 py-2"
          >
            <span className="text-sm">
              {s.name} <span className="text-muted">({s.count})</span>
            </span>
            <button
              onClick={() => del(s.name)}
              disabled={busy}
              className="bg-bad rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end">
        <button
          className="text-muted hover:text-text px-4 py-2"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
