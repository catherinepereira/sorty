import { useState } from "react";
import { prettyClass } from "../classname";
import { statusLabel } from "../status";
import type { Status } from "../types";

export interface Filters {
  classes: Set<string>;
  sources: Set<string>;
  statuses: Set<string>;
  classification: Set<string>;
}

const STATUS_OPTIONS = ["pending", "valid"];

const CLASSIFICATION_OPTIONS = ["correct", "mismatch"];
const CLASSIFICATION_LABELS: Record<string, string> = {
  correct: "Correctly classified",
  mismatch: "Mis-classified",
};

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-border border-b py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-sm font-medium"
      >
        <span>
          {title}
          {count > 0 && <span className="text-primary ml-1">({count})</span>}
        </span>
        <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function CheckList({
  options,
  chosen,
  onToggle,
  renderLabel = (v) => v,
  counts,
  disabled = false,
}: {
  options: string[];
  chosen: Set<string>;
  onToggle: (v: string) => void;
  renderLabel?: (value: string) => string;
  counts?: Record<string, number>;
  disabled?: boolean;
}) {
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto">
      {options.map((o) => (
        <label
          key={o}
          className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${
            disabled ? "opacity-40" : "hover:bg-bg cursor-pointer"
          }`}
        >
          <input
            type="checkbox"
            className="accent-primary"
            checked={chosen.has(o)}
            disabled={disabled}
            onChange={() => onToggle(o)}
          />
          <span className="flex-1 truncate">{renderLabel(o)}</span>
          {counts && <span className="text-muted">{counts[o] ?? 0}</span>}
        </label>
      ))}
    </div>
  );
}

/**
 * Filter the dataset grid by class and source. The two selections are ANDed: an image
 * passes only if its class is chosen (or none are) and its source is chosen (or none
 * are).
 */
export function FilterSidebar({
  classes,
  classCounts,
  sources,
  filters,
  setFilters,
  shown,
  total,
  hasPredictions,
}: {
  classes: string[];
  classCounts: Record<string, number>;
  sources: string[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  shown: number;
  total: number;
  hasPredictions: boolean;
}) {
  const toggle = (key: keyof Filters, value: string) => {
    const next = new Set(filters[key]);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setFilters({ ...filters, [key]: next });
  };

  const active =
    filters.classes.size > 0 ||
    filters.sources.size > 0 ||
    filters.statuses.size > 0 ||
    filters.classification.size > 0;

  const clearAll = () =>
    setFilters({
      classes: new Set(),
      sources: new Set(),
      statuses: new Set(),
      classification: new Set(),
    });

  return (
    <aside className="w-60 shrink-0">
      <div className="border-border bg-card sticky top-2 rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Filters</h2>
          {active && (
            <button
              onClick={clearAll}
              className="text-muted hover:text-text text-xs"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-muted mb-2 text-xs">
          Showing {shown} of {total}
        </p>

        <Section title="Status" count={filters.statuses.size}>
          <CheckList
            options={STATUS_OPTIONS}
            chosen={filters.statuses}
            onToggle={(v) => toggle("statuses", v)}
            renderLabel={(v) => statusLabel(v as Status)}
          />
        </Section>

        <Section title="Classes" count={filters.classes.size}>
          <CheckList
            options={classes}
            chosen={filters.classes}
            onToggle={(v) => toggle("classes", v)}
            renderLabel={prettyClass}
            counts={classCounts}
          />
        </Section>

        <Section title="Sources" count={filters.sources.size}>
          <CheckList
            options={sources}
            chosen={filters.sources}
            onToggle={(v) => toggle("sources", v)}
          />
        </Section>

        <Section title="Classification" count={filters.classification.size}>
          <CheckList
            options={CLASSIFICATION_OPTIONS}
            chosen={filters.classification}
            onToggle={(v) => toggle("classification", v)}
            renderLabel={(v) => CLASSIFICATION_LABELS[v]}
            disabled={!hasPredictions}
          />
          {!hasPredictions && (
            <p className="text-muted mt-1 text-xs">
              Train a model to show classifications.
            </p>
          )}
        </Section>
      </div>
    </aside>
  );
}
