import { useEffect, type ReactNode } from "react";

/** The standard dialog footer: a plain Cancel next to the primary action button. */
export function ModalActions({
  cancelLabel = "Cancel",
  actionLabel,
  onCancel,
  onAction,
  disabled = false,
}: {
  cancelLabel?: string;
  actionLabel: ReactNode;
  onCancel: () => void;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button
        className="text-muted hover:text-text px-4 py-2"
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
      <button
        className="bg-primary rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
        disabled={disabled}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${width} border-border bg-card rounded-xl border p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
