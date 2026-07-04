import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../api";
import { useDataset } from "../stores/dataset";
import type { Item, Status } from "../types";

const STATUSES: Status[] = ["pending", "valid", "invalid"];

export function AnnotateDialog({
  item,
  datasetName,
  onClose,
  onDelete,
}: {
  item: Item | null;
  datasetName: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const replaceItem = useDataset((s) => s.replaceItem);
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [dims, setDims] = useState<{
    width: number | null;
    height: number | null;
    bytes: number | null;
  } | null>(null);

  useEffect(() => {
    if (item) {
      setSubject(item.subject);
      setNote(item.note);
      setDims(null);
      api
        .getItem(datasetName, item.id)
        .then((d) =>
          setDims({ width: d.width, height: d.height, bytes: d.bytes }),
        )
        .catch(() => {});
    }
  }, [item, datasetName]);

  if (!item) return null;

  const save = async () => {
    setSaving(true);
    try {
      if (subject.trim() && subject.trim() !== item.subject) {
        replaceItem(
          (await api.setLabel(datasetName, item.id, subject.trim())).item,
        );
      }
      if (note !== item.note) {
        replaceItem((await api.setNote(datasetName, item.id, note)).item);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status: Status) => {
    replaceItem((await api.setStatus(datasetName, item.id, status)).item);
  };

  return (
    <Modal open onClose={onClose} width="max-w-2xl">
      <div className="flex gap-5">
        <div className="w-48 shrink-0">
          <img
            src={item.url}
            alt={item.subject}
            className="h-48 w-48 rounded-lg object-cover"
          />
          <ItemDetail item={item} dims={dims} />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <label className="text-sm font-medium">Class</label>
            <input
              className="border-border focus:border-primary mt-1 w-full rounded-lg border px-3 py-2 outline-none"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <div className="mt-1 flex gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                    item.status === s
                      ? "bg-primary text-white"
                      : "border-border text-muted hover:bg-bg border"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Note</label>
            <textarea
              className="border-border focus:border-primary mt-1 w-full resize-none rounded-lg border px-3 py-2 outline-none"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button
          className="text-bad hover:bg-bad/10 rounded-lg px-4 py-2"
          onClick={() => onDelete(item.id)}
        >
          Delete to bin
        </button>
        <div className="flex gap-3">
          <button
            className="text-muted hover:text-text px-4 py-2"
            onClick={onClose}
          >
            Close
          </button>
          <button
            className="bg-primary rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
            disabled={saving}
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

function ItemDetail({
  item,
  dims,
}: {
  item: Item;
  dims: {
    width: number | null;
    height: number | null;
    bytes: number | null;
  } | null;
}) {
  return (
    <dl className="mt-3 space-y-1 text-xs">
      <Row label="Source" value={item.source} />
      {item.source_url && (
        <div>
          <dt className="text-muted">Source URL</dt>
          <dd className="truncate">
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
              title={item.source_url}
            >
              {item.source_url}
            </a>
          </dd>
        </div>
      )}
      {item.title && <Row label="Title" value={item.title} />}
      <Row label="Folder" value={item.directory} />
      <Row label="File" value={item.filename} />
      {dims && dims.width && (
        <Row label="Size" value={`${dims.width}×${dims.height}`} />
      )}
      {dims && dims.bytes != null && (
        <Row label="On disk" value={humanBytes(dims.bytes)} />
      )}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}
