import {
  BrainIcon,
  MagnifierIcon,
  MirrorIcon,
  SparklesIcon,
  TargetIcon,
} from "./icons";

/**
 * The dataset's ML actions as a grid of labeled icon buttons. Each callback kicks off a
 * background job the page tracks. Buttons are always enabled since torch is a base
 * dependency.
 */
export function MLToolsPanel({
  onGenerate,
  onDuplicates,
  onOutliers,
  onTrain,
  onClassify,
}: {
  onGenerate: () => void;
  onDuplicates: () => void;
  onOutliers: () => void;
  onTrain: () => void;
  onClassify: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      <ToolButton label="Generate images" icon={<SparklesIcon className="h-5 w-5" />} onClick={onGenerate} />
      <ToolButton label="Find duplicates" icon={<MirrorIcon className="h-5 w-5" />} onClick={onDuplicates} />
      <ToolButton label="Find outliers" icon={<MagnifierIcon className="h-5 w-5" />} onClick={onOutliers} />
      <ToolButton label="Train model" icon={<BrainIcon className="h-5 w-5" />} onClick={onTrain} />
      <ToolButton label="Run classifier" icon={<TargetIcon className="h-5 w-5" />} onClick={onClassify} />
    </div>
  );
}

function ToolButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="border-border hover:border-primary hover:bg-primary-soft flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center text-sm font-medium transition"
    >
      <span className="text-primary">{icon}</span>
      {label}
    </button>
  );
}
