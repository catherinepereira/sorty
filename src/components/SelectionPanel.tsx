import { useState } from "react";
import { FlipHIcon, FlipVIcon } from "./icons";
import { statusLabel } from "../status";
import { prettyClass } from "../classname";
import { btnDanger, btnPrimary } from "../ui";
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
  // selected images whose model prediction differs from their class
  disagreements: number;
  onSelectAll: () => void;
  onClear: () => void;
  // resolve to clear the queued changes, reject to keep them for a retry
  onApply: (changes: SelectionChanges) => Promise<void>;
  onAcceptModel: () => void;
  onDelete: () => void;
};

const SELECT =
  "border-primary-line bg-card h-8 rounded-md border px-1.5 disabled:opacity-40";

/**
 * The bar shown while images are selected. The dropdowns and flips queue changes so
 * several land in one Apply. Accept model label and Delete act immediately
 */
export function SelectionPanel({
  count,
  classes,
  locks,
  disagreements,
  onSelectAll,
  onClear,
  onApply,
  onAcceptModel,
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
    <div className="bg-primary-soft text-text sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2">
      <span className="text-primary font-semibold">{count} selected</span>
      <button className="text-primary hover:underline" onClick={onSelectAll}>
        Select all shown
      </button>
      <button className="text-primary hover:underline" onClick={onClear}>
        Clear
      </button>
      <span
        className="bg-primary-line mx-1 h-5 w-px max-sm:hidden"
        aria-hidden="true"
      />
      <select
        className={SELECT}
        value={pending.status ?? ""}
        disabled={locks.review}
        title={
          locks.review ? "Reviewing is locked for this dataset" : undefined
        }
        onChange={(e) =>
          set({ status: e.target.value ? (e.target.value as Status) : null })
        }
        aria-label="Mark as"
      >
        <option value="">Mark as…</option>
        <option value="valid">{statusLabel("valid")}</option>
        <option value="pending">{statusLabel("pending")}</option>
      </select>
      <select
        className={SELECT}
        value={pending.subject ?? ""}
        onChange={(e) => set({ subject: e.target.value || null })}
        aria-label="Move to class"
      >
        <option value="">Move to class…</option>
        {classes.map((c) => (
          <option key={c} value={c}>
            {prettyClass(c)}
          </option>
        ))}
      </select>
      <select
        className={SELECT}
        value={pending.split ?? ""}
        disabled={locks.splits}
        title={locks.splits ? "Splits are locked for this dataset" : undefined}
        onChange={(e) => set({ split: e.target.value || null })}
        aria-label="Move to split"
      >
        <option value="">Move to split…</option>
        <option value="train">Train</option>
        <option value="test">Test</option>
        <option value="valid">Valid</option>
        <option value="none">No split</option>
      </select>
      <FlipToggle
        on={pending.flipY}
        title="Mirror left-right"
        onClick={() => set({ flipY: !pending.flipY })}
      >
        <FlipHIcon className="h-4 w-4" />
      </FlipToggle>
      <FlipToggle
        on={pending.flipX}
        title="Flip top-bottom"
        onClick={() => set({ flipX: !pending.flipX })}
      >
        <FlipVIcon className="h-4 w-4" />
      </FlipToggle>
      <button className={btnPrimary} disabled={!dirty || busy} onClick={apply}>
        {busy ? "Applying" : "Apply"}
      </button>
      <div className="flex-1" />
      {disagreements > 0 && (
        <button
          className="border-primary-line bg-card hover:bg-subtle inline-flex h-8 items-center rounded-md border px-3"
          onClick={onAcceptModel}
          title="Move each selected image to the class the model predicted"
        >
          Accept model label ({disagreements})
        </button>
      )}
      <button className={btnDanger} onClick={onDelete}>
        Delete
      </button>
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
      aria-label={title}
      aria-pressed={on}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md border ${
        on
          ? "border-primary bg-primary text-white"
          : "border-primary-line bg-card hover:bg-subtle"
      }`}
    >
      {children}
    </button>
  );
}
