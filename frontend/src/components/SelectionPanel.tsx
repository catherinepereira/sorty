import { useState } from "react";
import { Select } from "./Select";
import { FlipHIcon, FlipVIcon } from "./icons";
import { statusLabel } from "../status";
import { prettyClass } from "../classname";
import type { Status } from "../types";

// the changes queued while selecting, applied together on Apply
export type SelectionChanges = {
  status: Status | null;
  subject: string | null;
  // "train" | "test" | "valid" | "none" (out of any split), null when unchanged
  split: string | null;
  // mirror left-right (y-axis) and flip top-bottom (x-axis)
  flipY: boolean;
  flipX: boolean;
};

const NO_CHANGES: SelectionChanges = {
  status: null,
  subject: null,
  split: null,
  flipY: false,
  flipX: false,
};

type Props = {
  count: number;
  classes: string[];
  locks: { splits: boolean; review: boolean };
  onSelectAll: () => void;
  onClear: () => void;
  // resolve to clear the queued changes, reject to keep them for a retry
  onApply: (changes: SelectionChanges) => Promise<void>;
  onDelete: () => void;
};

/**
 * The bar shown while images are selected. Controls queue changes without applying
 * them, so several edits (status, class, split, flips) land in one Apply. Delete is
 * the exception and acts immediately, behind its own confirm.
 */
export function SelectionPanel({
  count,
  classes,
  locks,
  onSelectAll,
  onClear,
  onApply,
  onDelete,
}: Props) {
  const [pending, setPending] = useState<SelectionChanges>(NO_CHANGES);
  const [busy, setBusy] = useState(false);
  const dirty =
    pending.status !== null ||
    pending.subject !== null ||
    pending.split !== null ||
    pending.flipY ||
    pending.flipX;

  const set = (patch: Partial<SelectionChanges>) =>
    setPending((p) => ({ ...p, ...patch }));

  const apply = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      await onApply(pending);
      setPending(NO_CHANGES);
    } catch {
      // the page already showed the error, keep the queued changes for a retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-primary bg-primary-soft sticky top-2 z-10 mb-4 rounded-xl border px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{count} selected</span>
        <button
          className="text-muted hover:text-text text-sm"
          onClick={onSelectAll}
        >
          Select all
        </button>
        <button
          className="text-muted hover:text-text text-sm"
          onClick={onClear}
        >
          Clear
        </button>
        <span className="text-muted ml-auto hidden text-xs sm:block">
          Queue changes below, then apply them to every selected image
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field
          label="Mark as"
          locked={locks.review}
          lockHint="Reviewing is locked for this dataset"
        >
          <Select
            className="w-36"
            value={pending.status ?? ""}
            placeholder="No change"
            options={[
              { value: "", label: "No change" },
              { value: "valid", label: statusLabel("valid") },
              { value: "pending", label: statusLabel("pending") },
            ]}
            onChange={(v) => set({ status: v ? (v as Status) : null })}
          />
        </Field>
        <Field label="Move to class">
          <Select
            className="w-44"
            value={pending.subject ?? ""}
            placeholder="No change"
            options={[
              { value: "", label: "No change" },
              ...classes.map((c) => ({ value: c, label: prettyClass(c) })),
            ]}
            onChange={(v) => set({ subject: v || null })}
          />
        </Field>
        <Field
          label="Move to split"
          locked={locks.splits}
          lockHint="Splits are locked for this dataset"
        >
          <Select
            className="w-36"
            value={pending.split ?? ""}
            placeholder="No change"
            options={[
              { value: "", label: "No change" },
              { value: "train", label: "Train" },
              { value: "test", label: "Test" },
              { value: "valid", label: "Valid" },
              { value: "none", label: "No split" },
            ]}
            onChange={(v) => set({ split: v || null })}
          />
        </Field>
        <Field label="Flip">
          <div className="flex gap-2">
            <FlipToggle
              on={pending.flipY}
              title="Mirror left-right (y-axis)"
              onClick={() => set({ flipY: !pending.flipY })}
            >
              <FlipHIcon className="h-4 w-4" />
              Left-right
            </FlipToggle>
            <FlipToggle
              on={pending.flipX}
              title="Flip top-bottom (x-axis)"
              onClick={() => set({ flipX: !pending.flipX })}
            >
              <FlipVIcon className="h-4 w-4" />
              Top-bottom
            </FlipToggle>
          </div>
        </Field>
        <div className="ml-auto flex gap-2">
          <button
            className="bg-primary rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!dirty || busy}
            onClick={apply}
          >
            {busy ? "Applying" : "Apply"}
          </button>
          <button
            className="bg-bad rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            onClick={onDelete}
          >
            Delete to bin
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  locked,
  lockHint,
  children,
}: {
  label: string;
  locked?: boolean;
  lockHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={locked ? "pointer-events-none opacity-40" : ""}
      title={locked ? lockHint : undefined}
    >
      <div className="text-muted mb-1 text-xs font-medium">{label}</div>
      {children}
    </div>
  );
}

function FlipToggle({
  on,
  title,
  onClick,
  children,
}: {
  on: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${
        on
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card hover:border-primary"
      }`}
    >
      {children}
    </button>
  );
}
