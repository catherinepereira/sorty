import { Modal } from "./Modal";

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onResolve,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onResolve: (ok: boolean) => void;
}) {
  return (
    <Modal open={open} onClose={() => onResolve(false)} width="max-w-md">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted mt-2">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          className="text-muted hover:bg-bg rounded-lg px-4 py-2"
          onClick={() => onResolve(false)}
        >
          Cancel
        </button>
        <button
          className={`rounded-lg px-4 py-2 font-medium text-white ${
            danger
              ? "bg-bad hover:brightness-95"
              : "bg-primary hover:brightness-95"
          }`}
          onClick={() => onResolve(true)}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
