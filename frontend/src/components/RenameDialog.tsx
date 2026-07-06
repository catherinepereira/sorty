import { useState } from "react";
import { Modal, ModalActions } from "./Modal";

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
      <ModalActions
        actionLabel="Rename"
        disabled={!name.trim()}
        onCancel={onClose}
        onAction={() => onRename(name)}
      />
    </Modal>
  );
}
