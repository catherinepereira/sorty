import { memo, useState } from "react";
import type { Item } from "../types";
import { StatusChip } from "./StatusChip";
import { BoxOverlay } from "./BoxOverlay";
import { TrashIcon } from "./icons";
import { prettyClass } from "../classname";

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

  const name = prettyClass(item.label);
  const hasBoxes = item.boxes.length > 0;
  // natural pixel size, needed to scale the box overlay; captured on image load
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  return (
    <div
      className={`group bg-card relative overflow-hidden rounded-lg border transition ${
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
        aria-label={`Select ${name}`}
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-bad/90 absolute top-2 right-2 z-[1] flex h-6 w-6 items-center justify-center rounded-full text-white opacity-0 transition group-hover:opacity-100"
        aria-label={`Delete ${name} to bin`}
        title="Delete to bin"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
      <button className="block w-full" onClick={clickCard}>
        {hasBoxes ? (
          // annotated: letterbox the image and wrap it tightly so the box overlay,
          // scaled to natural pixels, lines up with the rendered image rect
          <div className="bg-bg flex aspect-square w-full items-center justify-center">
            <div className="relative">
              <img
                src={item.url}
                alt={name}
                onLoad={(e) =>
                  setNatural({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
                className="block max-h-full w-auto object-contain"
                style={{ maxHeight: "100%", maxWidth: "100%" }}
                loading="lazy"
              />
              <BoxOverlay
                boxes={item.boxes}
                natural={natural}
                showLabels={false}
              />
            </div>
          </div>
        ) : (
          <img
            src={item.url}
            alt={name}
            className="aspect-square w-full object-cover"
            loading="lazy"
          />
        )}
      </button>
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="truncate text-sm" title={name}>
          {name}
        </span>
        <StatusChip status={item.status} />
      </div>
    </div>
  );
});
