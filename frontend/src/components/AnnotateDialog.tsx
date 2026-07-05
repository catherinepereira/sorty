import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { prettyClass } from "../classname";
import { api } from "../api";
import { useDataset } from "../stores/dataset";
import type { Item, Status } from "../types";
import { statusLabel } from "../status";
import { CloseIcon, TrashIcon } from "./icons";

const STATUSES: Status[] = ["pending", "valid"];

// active-state colors per status, so Valid reads green like the chip and grid badges do
const ACTIVE_STATUS: Record<Status, string> = {
  valid: "bg-good text-white",
  pending: "bg-primary text-white",
  invalid: "bg-bad text-white",
};

export function AnnotateDialog({
  item,
  datasetName,
  classes,
  onClose,
  onDelete,
}: {
  item: Item | null;
  datasetName: string;
  classes: string[];
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const replaceItem = useDataset((s) => s.replaceItem);
  const [current, setCurrent] = useState<Item | null>(item);
  const [dims, setDims] = useState<{
    width: number | null;
    height: number | null;
    bytes: number | null;
  } | null>(null);

  useEffect(() => {
    setCurrent(item);
    if (item) {
      setDims(null);
      api
        .getItem(datasetName, item.id)
        .then((d) =>
          setDims({ width: d.width, height: d.height, bytes: d.bytes }),
        )
        .catch(() => {});
    }
  }, [item, datasetName]);

  if (!current) return null;

  // update both the store (so the grid reflects the change) and the modal's own copy
  const applied = (updated: Item) => {
    setCurrent(updated);
    replaceItem(updated);
  };

  const setSubject = async (next: string) => {
    if (!next || next === current.label) return;
    applied((await api.setLabel(datasetName, current.id, next)).item);
  };

  const setStatus = async (status: Status) => {
    applied((await api.setStatus(datasetName, current.id, status)).item);
  };

  // the current class may be one the dataset no longer declares, so include it as an option
  const classOptions = (
    classes.includes(current.label) ? classes : [current.label, ...classes]
  ).map((c) => ({ value: c, label: prettyClass(c) }));

  return (
    <Modal open onClose={onClose} width="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 truncate text-lg font-semibold">
            {prettyClass(current.label)}
          </h2>
          <button
            onClick={() => onDelete(current.id)}
            className="bg-bad/90 flex h-8 w-8 items-center justify-center rounded-full text-white hover:brightness-95"
            title="Delete to bin"
            aria-label="Delete to bin"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="border-border text-muted hover:bg-bg flex h-8 w-8 items-center justify-center rounded-full border"
            title="Close"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <img
          src={current.url}
          alt={prettyClass(current.label)}
          className="bg-bg max-h-[60vh] w-full rounded-lg object-contain"
        />

        <ItemDetail item={current} dims={dims} />

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-40 flex-1">
            <label className="text-sm font-medium">Class</label>
            <Select
              className="mt-1"
              value={current.label}
              placeholder="Choose class"
              options={classOptions}
              onChange={setSubject}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <div className="mt-1 flex gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    current.status === s
                      ? ACTIVE_STATUS[s]
                      : "border-border text-muted hover:bg-bg border"
                  }`}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>
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
        <div className="flex justify-between gap-2">
          <dt className="text-muted shrink-0">Source URL</dt>
          <a
            href={item.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-primary min-w-0 truncate hover:underline"
            title={item.source_url}
          >
            {item.source_url}
          </a>
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
