import { useState } from "react";
import { ChevronIcon } from "./icons";

/**
 * A titled panel that collapses to just its header row. defaultOpen sets the initial
 * state; the header stays clickable to toggle.
 */
export function Expandable({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-border bg-card mb-3 overflow-hidden rounded-lg border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-bg flex w-full items-center gap-2 px-4 py-3 text-left font-medium"
      >
        <ChevronIcon open={open} className="text-muted h-4 w-4" />
        {icon}
        <span>{title}</span>
      </button>
      {/* hidden, not unmounted, so children keep their state and fetched data */}
      <div className={open ? "border-border border-t px-4 py-4" : "hidden"}>
        {children}
      </div>
    </div>
  );
}
