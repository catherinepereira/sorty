import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../api";
import { ClassEditor } from "./ClassEditor";

export function AddClassesDialog({
  open,
  datasetName,
  current,
  onClose,
  onSaved,
}: {
  open: boolean;
  datasetName: string;
  current: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [classes, setClasses] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setClasses(current);
  }, [open, current]);

  const save = async () => {
    setBusy(true);
    try {
      await api.setSubjects(datasetName, classes);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-xl">
      <h2 className="text-lg font-semibold">Classes</h2>
      <p className="text-muted mt-1 text-sm">
        Add or edit classes. Generate images for them from the toolbar
        afterward.
      </p>
      <div className="mt-4">
        <ClassEditor
          datasetName={datasetName}
          classes={classes}
          setClasses={setClasses}
        />
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          className="text-muted hover:text-text px-4 py-2"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="bg-primary rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
          disabled={busy}
          onClick={save}
        >
          Save classes
        </button>
      </div>
    </Modal>
  );
}
