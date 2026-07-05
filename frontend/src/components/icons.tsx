/**
 * Small inline SVG icons, sized to the current font by default (1em). Stroke-based so
 * they inherit the text color through currentColor.
 */
type IconProps = { className?: string };

function Svg({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function SparklesIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" />
      <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z" />
    </Svg>
  );
}

export function MirrorIcon(p: IconProps) {
  // two facing panels for duplicate detection
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="7" height="14" rx="1" />
      <rect x="14" y="5" width="7" height="14" rx="1" />
      <path d="M12 3v18" strokeDasharray="2 2" />
    </Svg>
  );
}

export function MagnifierIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Svg>
  );
}

export function BrainIcon(p: IconProps) {
  // stand-in for training the model
  return (
    <Svg {...p}>
      <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 4 2.8" />
      <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a3 3 0 0 1-4 2.8" />
      <path d="M12 4v16" />
    </Svg>
  );
}

export function TargetIcon(p: IconProps) {
  // running the classifier over the dataset
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </Svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M9 7V4h6v3" />
    </Svg>
  );
}

export function MergeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 4v5a5 5 0 0 0 5 5 5 5 0 0 0 5-5V4" />
      <path d="M12 14v6" />
      <path d="M9 17l3 3 3-3" />
    </Svg>
  );
}

export function PencilIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M13.5 6.5l3 3" />
    </Svg>
  );
}

export function RefreshIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 11a8 8 0 0 0-14-4.5L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14 4.5L20 16" />
      <path d="M20 20v-4h-4" />
    </Svg>
  );
}

export function ChevronIcon({ open, className }: IconProps & { open: boolean }) {
  return (
    <Svg className={className ?? "h-4 w-4"}>
      <path d={open ? "M6 15l6-6 6 6" : "M9 6l6 6-6 6"} />
    </Svg>
  );
}
