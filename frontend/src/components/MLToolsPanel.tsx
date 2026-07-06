import {
  ArchiveIcon,
  BrainIcon,
  DownloadIcon,
  LayersIcon,
  MirrorIcon,
  SparklesIcon,
} from "./icons";

/**
 * The dataset's ML actions as a grid of labeled icon buttons. Each callback kicks off a
 * background job the page tracks. While one runs, the job-starting tiles gray out so
 * jobs can't stack, the export tiles stay usable.
 */
export function MLToolsPanel({
  busy,
  onGenerate,
  onDuplicates,
  onCrossval,
  onTrain,
  onExport,
  onExportDataset,
}: {
  // a job is running, disable the tiles that would start another
  busy: boolean;
  onGenerate: () => void;
  onDuplicates: () => void;
  onCrossval: () => void;
  onTrain: () => void;
  // absent until a saved model exists
  onExport?: () => void;
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
        label="Train model"
        icon={<BrainIcon className="h-5 w-5" />}
        onClick={onTrain}
        disabled={busy}
      />
      <ToolButton
        label="Export dataset"
        icon={<ArchiveIcon className="h-5 w-5" />}
        onClick={onExportDataset}
      />
      {onExport && (
        <ToolButton
          label="Export model"
          icon={<DownloadIcon className="h-5 w-5" />}
          onClick={onExport}
        />
      )}
    </div>
  );
}

function ToolButton({
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
