import { memo } from "react";
import type { Item } from "../types";
import { StatusChip } from "./StatusChip";

// memoized so a drag-select that flips one card's selection re-renders only that card,
// not the whole grid
export const ImageCard = memo(function ImageCard({
  item,
  selected,
  selectMode,
  onToggle,
  onOpen,
  onDelete,
}: {
  item: Item;
  selected: boolean;
  selectMode: boolean;
  onToggle: (id: string) => void;
  onOpen: (item: Item) => void;
  onDelete: (id: string) => void;
}) {
  // in select mode the grid wrapper's mousedown/drag owns selection, so the card click
  // only opens the detail view when not selecting
  const clickCard = () => {
    if (!selectMode) onOpen(item);
  };

  return (
    <div
      className={`group bg-card relative overflow-hidden rounded-xl border transition ${
        selected ? "border-primary ring-primary/40 ring-2" : "border-border"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(item.id)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="accent-primary absolute top-2 left-2 z-[1] h-5 w-5 cursor-pointer"
        aria-label={`Select ${item.subject}`}
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-bad/90 absolute top-2 right-2 z-[1] flex h-6 w-6 items-center justify-center rounded-full text-sm text-white opacity-0 transition group-hover:opacity-100"
        aria-label={`Delete ${item.subject} to bin`}
        title="Delete to bin"
      >
        ×
      </button>
      <button className="block w-full" onClick={clickCard}>
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
    </div>
  );
});
