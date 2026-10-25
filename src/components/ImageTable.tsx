import type { Item } from "../types";
import { StatusChip } from "./StatusChip";
import { ModelLine } from "./ImageCard";
import { prettyClass } from "../classname";

const TH = "px-3 py-2.5 font-medium";
const TD = "px-3 py-1.5";

/** One row per image, with the same inline relabel and model accept as the grid */
export function ImageTable({
  items,
  classes,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onRelabel,
}: {
  items: Item[];
  classes: string[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  onOpen: (item: Item) => void;
  onRelabel: (id: string, label: string) => void;
}) {
  const allOn = items.length > 0 && items.every((i) => selected.has(i.id));
  return (
    <div className="border-border bg-card relative overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[920px] border-collapse">
        <thead>
          <tr className="bg-bg text-muted text-left text-xs">
            <th scope="col" className={`${TH} w-8`}>
              <input
                type="checkbox"
                checked={allOn}
                onChange={() => onToggleAll(!allOn)}
                className="accent-primary"
                aria-label="Select every image on this page"
              />
            </th>
            <th scope="col" className="w-14 py-2.5">
              <span className="sr-only">Image</span>
            </th>
            <th scope="col" className={TH}>
              Id
            </th>
            <th scope="col" className={TH}>
              Class
            </th>
            <th scope="col" className={TH}>
              Model
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={TH}>
              Split
            </th>
            <th scope="col" className={TH}>
              Source
            </th>
            <th scope="col" className={TH}>
              File
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const on = selected.has(item.id);
            const options = classes.includes(item.label)
              ? classes
              : [item.label, ...classes];
            return (
              <tr
                key={item.id}
                className={`border-subtle border-t ${on ? "bg-primary-soft" : ""}`}
              >
                <td className={TD}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(item.id)}
                    className="accent-primary"
                    aria-label={`Select ${item.id}`}
                  />
                </td>
                <td className="py-1.5">
                  <button
                    onClick={() => onOpen(item)}
                    className="block"
                    aria-label={`Open ${item.id}`}
                  >
                    <img
                      src={item.url}
                      alt=""
                      className="bg-subtle h-12 w-12 rounded object-cover"
                      loading="lazy"
                    />
                  </button>
                </td>
                <td className={`${TD} font-mono text-[13px]`}>
                  {item.id.slice(0, 6)}
                </td>
                <td className={TD}>
                  <select
                    value={item.label}
                    onChange={(e) => onRelabel(item.id, e.target.value)}
                    className="border-border bg-card h-8 rounded-md border px-1.5"
                    aria-label={`Class for ${item.id}`}
                  >
                    {options.map((c) => (
                      <option key={c} value={c}>
                        {prettyClass(c)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`${TD} max-w-56`}>
                  <ModelLine item={item} onAccept={onRelabel} />
                </td>
                <td className={TD}>
                  <StatusChip status={item.status} />
                </td>
                <td className={`${TD} text-muted`}>{item.split ?? "none"}</td>
                <td className={TD}>
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {item.source}
                    </a>
                  ) : (
                    <span className="text-muted">{item.source}</span>
                  )}
                </td>
                <td
                  className={`${TD} text-muted max-w-64 truncate font-mono text-xs`}
                  title={item.local_path}
                >
                  {item.filename}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
