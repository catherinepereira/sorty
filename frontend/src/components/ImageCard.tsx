import type { Item } from "../types";
import { StatusChip } from "./StatusChip";

export function ImageCard({
  item,
  selected,
  onToggle,
  onOpen,
}: {
  item: Item;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={`group bg-card relative overflow-hidden rounded-xl border transition ${
        selected ? "border-primary ring-primary/40 ring-2" : "border-border"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="accent-primary absolute top-2 left-2 z-10 h-5 w-5 cursor-pointer"
        aria-label={`Select ${item.subject}`}
      />
      <button className="block w-full" onClick={onOpen}>
        <img
          src={item.url}
          alt={item.subject}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      </button>
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="truncate text-sm" title={item.subject}>
          {item.subject}
        </span>
        <StatusChip status={item.status} />
      </div>
      {item.note && (
        <div className="border-border text-muted border-t px-2 py-1 text-xs">
          {item.note}
        </div>
      )}
    </div>
  );
}
