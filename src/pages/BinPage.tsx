import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useConfirm } from "../hooks/useConfirm";
import { AppBar } from "../components/AppBar";
import { prettyClass } from "../classname";
import { btn, btnDanger, btnPrimary } from "../ui";
import type { Item } from "../types";

export function BinPage() {
  const { name = "" } = useParams();
  const { ask, element: confirmEl } = useConfirm();
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    api.getBin(name).then(setItems);
    setSelected(new Set());
  }, [name]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const restore = async () => {
    if (!selected.size) return;
    await api.restore(name, [...selected]);
    refresh();
  };

  const empty = async () => {
    const ok = await ask({
      title: "Empty the recycle bin",
      message: `Permanently delete all ${items.length} binned image${items.length > 1 ? "s" : ""}? This cannot be undone.`,
      confirmLabel: "Empty bin",
      danger: true,
    });
    if (!ok) return;
    await api.emptyBin(name);
    refresh();
  };

  return (
    <>
      <AppBar
        crumbs={
          <>
            <Link to={`/d/${name}`} className="font-semibold hover:underline">
              {name}
            </Link>
            <span className="text-muted" aria-hidden="true">
              /
            </span>
            <span className="font-semibold">Recycle bin</span>
          </>
        }
        meta={`${items.length} image${items.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Link to={`/d/${name}`} className={btn}>
              Back to dataset
            </Link>
            {items.length > 0 && (
              <button className={btnDanger} onClick={empty}>
                Empty bin
              </button>
            )}
          </>
        }
      />

      <main className="mx-auto flex max-w-[1600px] flex-col gap-3.5 px-6 py-5">
        {selected.size > 0 && (
          <div className="bg-primary-soft flex flex-wrap items-center gap-2 rounded-lg px-3 py-2">
            <span className="text-primary font-semibold">
              {selected.size} selected
            </span>
            <button
              className="text-primary hover:underline"
              onClick={() => setSelected(new Set(items.map((i) => i.id)))}
            >
              Select all
            </button>
            <button
              className="text-primary hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
            <div className="flex-1" />
            <button className={btnPrimary} onClick={restore}>
              Restore
            </button>
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-muted py-16 text-center">
            The recycle bin is empty.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {items.map((item) => {
              const on = selected.has(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border ${
                    on
                      ? "border-primary bg-primary-soft ring-primary ring-1"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(item.id)}
                      className="accent-primary absolute top-2 left-2 h-4 w-4"
                    />
                    <img
                      src={item.url}
                      alt={prettyClass(item.label)}
                      className="bg-subtle aspect-square w-full object-cover opacity-75"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <span className="flex-1 truncate">
                      {prettyClass(item.label)}
                    </span>
                    <span className="text-muted font-mono text-xs">
                      {item.id.slice(0, 6)}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </main>
      {confirmEl}
    </>
  );
}
