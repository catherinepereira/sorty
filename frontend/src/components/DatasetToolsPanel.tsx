import { ArchiveIcon, LayersIcon, MirrorIcon, SparklesIcon } from "./icons";

/**
 * Dataset-level actions as a grid of labeled icon buttons. Cross validate sits here
 * rather than in Training Tools because its predictions feed the grid's classification
 * filter for label cleanup. Job-starting tiles gray out while one runs, export only
 * downloads and stays usable.
 */
export function DatasetToolsPanel({
  busy,
  onGenerate,
  onDuplicates,
  onCrossval,
  onExportDataset,
}: {
  // a job is running, disable the tiles that would start another
  busy: boolean;
  onGenerate: () => void;
  onDuplicates: () => void;
  onCrossval: () => void;
  onExportDataset: () => void;
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
        label="Export dataset"
        icon={<ArchiveIcon className="h-5 w-5" />}
        onClick={onExportDataset}
      />
    </div>
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
