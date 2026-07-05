import { useState } from "react";
import { prettyClass } from "../classname";

export interface Filters {
  classes: Set<string>;
  sources: Set<string>;
  statuses: Set<string>;
}

const STATUS_OPTIONS = ["pending", "valid"];

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
}: {
  options: string[];
  chosen: Set<string>;
  onToggle: (v: string) => void;
  renderLabel?: (value: string) => string;
}) {
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto">
      {options.map((o) => (
        <label
          key={o}
          className="hover:bg-bg flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm"
        >
          <input
            type="checkbox"
            className="accent-primary"
            checked={chosen.has(o)}
            onChange={() => onToggle(o)}
          />
          <span className="truncate">{renderLabel(o)}</span>
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
  sources,
  filters,
  setFilters,
  shown,
  total,
}: {
  classes: string[];
  sources: string[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  shown: number;
  total: number;
}) {
  const toggle = (key: "classes" | "sources" | "statuses", value: string) => {
    const next = new Set(filters[key]);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setFilters({ ...filters, [key]: next });
  };

  const active =
    filters.classes.size > 0 ||
    filters.sources.size > 0 ||
    filters.statuses.size > 0;

  const clearAll = () =>
    setFilters({
      classes: new Set(),
      sources: new Set(),
      statuses: new Set(),
    });

  return (
    <aside className="w-56 shrink-0">
      <div className="sticky top-2">
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

        <Section title="Classes" count={filters.classes.size}>
          <CheckList
            options={classes}
            chosen={filters.classes}
            onToggle={(v) => toggle("classes", v)}
            renderLabel={prettyClass}
          />
        </Section>

        <Section title="Sources" count={filters.sources.size}>
          <CheckList
            options={sources}
            chosen={filters.sources}
            onToggle={(v) => toggle("sources", v)}
          />
        </Section>

        <Section title="Status" count={filters.statuses.size}>
          <CheckList
            options={STATUS_OPTIONS}
            chosen={filters.statuses}
            onToggle={(v) => toggle("statuses", v)}
          />
        </Section>
      </div>
    </aside>
  );
}
