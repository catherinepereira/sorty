import { useState } from "react";
import { Modal } from "./Modal";

export function RenameDialog({
  open,
  current,
  error,
  onClose,
  onRename,
}: {
  open: boolean;
  current: string;
  error: string;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(current);

  return (
    <Modal open={open} onClose={onClose} width="max-w-md">
      <h2 className="text-lg font-semibold">Rename dataset</h2>
      <input
        autoFocus
        className="border-border focus:border-primary mt-4 w-full rounded-lg border px-3 py-2 outline-none"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onRename(name)}
      />
      {error && <p className="text-bad mt-2 text-sm">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button
          className="text-muted hover:text-text px-4 py-2"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="bg-primary rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
          disabled={!name.trim()}
          onClick={() => onRename(name)}
        >
          Rename
        </button>
      </div>
    </Modal>
  );
}
