import type { Box } from "../types";
import { prettyClass } from "../classname";
import { boxColor } from "../boxcolor";

/**
 * Draw detection boxes over an image. Coordinates are COCO pixels of the natural image;
 * natural gives the image's pixel size so boxes scale to whatever size it renders at.
 * Absolutely positioned, so the parent must be relative and sized to the image.
 */
export function BoxOverlay({
  boxes,
  natural,
  showLabels = true,
}: {
  boxes: Box[];
  natural: { w: number; h: number } | null;
  showLabels?: boolean;
}) {
  if (!natural || !natural.w || !natural.h) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map((b, i) => {
        const color = boxColor(b.label);
        return (
          <div
            key={i}
            className="absolute border-2"
            style={{
              left: `${(b.x / natural.w) * 100}%`,
              top: `${(b.y / natural.h) * 100}%`,
              width: `${(b.w / natural.w) * 100}%`,
              height: `${(b.h / natural.h) * 100}%`,
              borderColor: color,
            }}
          >
            {showLabels && (
              <span
                className="absolute top-0 left-0 -translate-y-full px-1 text-[10px] leading-tight font-medium text-white"
                style={{ backgroundColor: color }}
              >
                {prettyClass(b.label)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
