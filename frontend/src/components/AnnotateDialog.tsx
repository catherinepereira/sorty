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

  useEffect(() => {
    if (item) {
      setSubject(item.subject);
      setNote(item.note);
    }
  }, [item]);

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
        <img
          src={item.url}
          alt={item.subject}
          className="h-48 w-48 rounded-lg object-cover"
        />
        <div className="flex-1 space-y-4">
          <div>
            <label className="text-sm font-medium">Subject</label>
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
