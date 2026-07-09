import {
  ArchiveIcon,
  ForkIcon,
  LayersIcon,
  LockIcon,
  MirrorIcon,
  SparklesIcon,
  UnlockIcon,
} from "./icons";

/**
 * Dataset-level actions as a grid of labeled icon buttons. Cross validate sits here
 * rather than in Training Tools because its predictions feed the grid's classification
 * filter for label cleanup. Job-starting tiles gray out while one runs, export only
 * downloads and stays usable. The lock tiles toggle dataset-wide guards the backend
 * enforces: no split moves while splits are locked, no status changes while reviewing is
 * locked.
 */
export function DatasetToolsPanel({
  busy,
  locks,
  onGenerate,
  onDuplicates,
  onCrossval,
  onCreateSplits,
  onExportDataset,
  onToggleLock,
}: {
  // a job is running, disable the tiles that would start another
  busy: boolean;
  locks: { splits: boolean; review: boolean };
  onGenerate: () => void;
  onDuplicates: () => void;
  onCrossval: () => void;
  onCreateSplits: () => void;
  onExportDataset: () => void;
  onToggleLock: (which: "splits" | "review") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <ToolButton
        label="Generate images"
        icon={<SparklesIcon className="h-5 w-5" />}
        onClick={onGenerate}
        disabled={busy}
      />
      <ToolButton
        label="Find duplicates"
        icon={<MirrorIcon className="h-5 w-5" />}
        onClick={onDuplicates}
        disabled={busy}
      />
      <ToolButton
        label="Cross validate"
        icon={<LayersIcon className="h-5 w-5" />}
        onClick={onCrossval}
        disabled={busy}
      />
      <ToolButton
        label="Create splits"
        icon={<ForkIcon className="h-5 w-5" />}
        onClick={onCreateSplits}
        disabled={busy || locks.splits}
      />
      <ToolButton
        label="Export dataset"
        icon={<ArchiveIcon className="h-5 w-5" />}
        onClick={onExportDataset}
      />
      <LockTile
        subject="splits"
        locked={locks.splits}
        hint="moving images between train, test, and valid splits"
        onToggle={() => onToggleLock("splits")}
      />
      <LockTile
        subject="reviewing"
        locked={locks.review}
        hint="changing review statuses"
        onToggle={() => onToggleLock("review")}
      />
    </div>
  );
}

function LockTile({
  subject,
  locked,
  hint,
  onToggle,
}: {
  subject: string;
  locked: boolean;
  hint: string;
  onToggle: () => void;
}) {
  const cap = subject[0].toUpperCase() + subject.slice(1);
  return (
    <button
      onClick={onToggle}
      title={
        locked
          ? `${cap} locked: ${hint} is blocked. Click to unlock`
          : `Lock ${subject} to block ${hint}`
      }
      className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center text-sm font-medium transition ${
        locked
          ? "border-warn/40 bg-warn/10 text-warn hover:bg-warn/20"
          : "border-border hover:border-primary hover:bg-primary-soft"
      }`}
    >
      <span className={locked ? "" : "text-primary"}>
        {locked ? (
          <LockIcon className="h-5 w-5" />
        ) : (
          <UnlockIcon className="h-5 w-5" />
        )}
      </span>
      {locked ? `${cap} locked` : `Lock ${subject}`}
    </button>
  );
}

export function ToolButton({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`border-border flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center text-sm font-medium transition ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:border-primary hover:bg-primary-soft"
      }`}
    >
      <span className="text-primary">{icon}</span>
      {label}
    </button>
  );
}
