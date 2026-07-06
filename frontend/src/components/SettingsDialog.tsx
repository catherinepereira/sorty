import { useEffect, useState } from "react";
import { Modal, ModalActions } from "./Modal";
import {
  DEFAULT_HOTKEYS,
  getHotkeys,
  setHotkeys,
  type Hotkeys,
} from "../settings";
import { statusLabel } from "../status";

export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [keys, setKeys] = useState<Hotkeys>(getHotkeys);

  useEffect(() => {
    if (open) setKeys(getHotkeys());
  }, [open]);

  const save = () => {
    setHotkeys(keys);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-md">
      <h2 className="text-lg font-semibold">Settings</h2>
      <p className="text-muted mt-1 text-sm">
        Hotkeys apply while an image popup is open. Click a field and press a
        key.
      </p>
      <div className="mt-4 space-y-3">
        <KeyRow
          label={`Mark ${statusLabel("pending")}`}
          value={keys.unreviewed}
          onKey={(k) => setKeys({ ...keys, unreviewed: k })}
        />
        <KeyRow
          label={`Mark ${statusLabel("valid")}`}
          value={keys.valid}
          onKey={(k) => setKeys({ ...keys, valid: k })}
        />
      </div>
      <button
        className="text-muted hover:text-text mt-3 text-xs underline"
        onClick={() => setKeys(DEFAULT_HOTKEYS)}
      >
        Reset to defaults
      </button>
      <ModalActions actionLabel="Save" onCancel={onClose} onAction={save} />
    </Modal>
  );
}

function KeyRow({
  label,
  value,
  onKey,
}: {
  label: string;
  value: string;
  onKey: (key: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        readOnly
        value={value}
        onKeyDown={(e) => {
          // single printable characters only, so Escape still closes the dialog
          if (e.key.length === 1) {
            e.preventDefault();
            onKey(e.key);
          }
        }}
        className="border-border focus:border-primary w-16 cursor-pointer rounded-lg border px-2 py-1 text-center outline-none"
        aria-label={`Hotkey for ${label}`}
      />
    </label>
  );
}
