import { memo, useState } from "react";
import type { Item } from "../types";
import { StatusChip } from "./StatusChip";
import { BoxOverlay } from "./BoxOverlay";
import { TrashIcon } from "./icons";
import { prettyClass } from "../classname";
import { scoreText } from "../format";

// memoized so a drag-select that flips one card's selection re-renders only that card,
// not the whole grid
export const ImageCard = memo(function ImageCard({
  item,
  classes,
  selected,
  selectMode,
  onToggle,
  onOpen,
  onDelete,
  onRelabel,
}: {
  item: Item;
  classes: string[];
  selected: boolean;
  selectMode: boolean;
  onToggle: (id: string) => void;
  onOpen: (item: Item) => void;
  onDelete: (id: string) => void;
  onRelabel: (id: string, label: string) => void;
}) {
  // in select mode the grid wrapper's mousedown/drag owns selection, so the image
  // click only opens the detail view when not selecting
  const clickImage = () => {
    if (!selectMode) onOpen(item);
  };

  const name = prettyClass(item.label);
  const hasBoxes = item.boxes.length > 0;
  // natural pixel size, needed to scale the box overlay; captured on image load
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const options = classes.includes(item.label)
    ? classes
    : [item.label, ...classes];
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className={`group flex min-w-0 flex-col overflow-hidden rounded-lg border ${
        selected
          ? "border-primary bg-primary-soft ring-primary ring-1"
          : "border-border bg-card"
      }`}
    >
      <div className="relative">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.id)}
          onClick={stop}
          onMouseDown={stop}
          className="accent-primary absolute top-2 left-2 z-[1] h-4 w-4 cursor-pointer"
          aria-label={`Select ${item.id}`}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          onMouseDown={stop}
          className="bg-card/90 text-bad absolute top-2 right-2 z-[1] flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition group-hover:opacity-100 focus:opacity-100"
          aria-label={`Delete ${item.id} to bin`}
          title="Delete to bin"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
        <button className="bg-subtle block w-full" onClick={clickImage}>
          {hasBoxes ? (
            // annotated: letterbox the image and wrap it tightly so the box overlay,
            // scaled to natural pixels, lines up with the rendered image rect
            <div className="flex aspect-square w-full items-center justify-center">
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
      </div>
      <div className="flex flex-col gap-1.5 px-2.5 pt-2 pb-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className="text-muted flex-1 truncate font-mono text-xs"
            title={item.filename}
          >
            {item.id.slice(0, 6)}
          </span>
          <StatusChip status={item.status} />
        </div>
        <select
          value={item.label}
          onChange={(e) => onRelabel(item.id, e.target.value)}
          onMouseDown={stop}
          className="border-border bg-card h-8 min-w-0 rounded-md border px-1.5"
          aria-label={`Class for ${item.id}`}
        >
          {options.map((c) => (
            <option key={c} value={c}>
              {prettyClass(c)}
            </option>
          ))}
        </select>
        <ModelLine item={item} onAccept={onRelabel} />
      </div>
    </div>
  );
});

/** What the model predicted. On a disagreement, clicking the predicted class accepts it */
export function ModelLine({
  item,
  onAccept,
}: {
  item: Item;
  onAccept: (id: string, label: string) => void;
}) {
  if (item.predicted === null) return null;
  const score = item.predicted_score;
  if (item.predicted === item.label)
    return (
      <span className="text-muted flex items-center gap-1.5 text-xs">
        <span className="flex-1">Model agrees</span>
        <span className="font-mono">{scoreText(score)}</span>
      </span>
    );
  const predicted = item.predicted;
  return (
    <span className="text-warn flex items-center gap-1.5 text-xs font-semibold">
      <button
        onClick={() => onAccept(item.id, predicted)}
        onMouseDown={(e) => e.stopPropagation()}
        className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline"
        title={`Accept: move to ${prettyClass(predicted)}`}
        aria-label={`Accept model class ${prettyClass(predicted)}`}
      >
        Model: {prettyClass(predicted)}
      </button>
      {score !== null && (
        <>
          <span
            className="bg-warn-line/40 h-1.5 w-10 shrink-0 overflow-hidden rounded-full"
            aria-hidden="true"
          >
            <span
              className="bg-warn-line block h-full rounded-full"
              style={{ width: `${Math.round(score * 100)}%` }}
            />
          </span>
          <span className="font-mono font-normal">{scoreText(score)}</span>
        </>
      )}
    </span>
  );
}
