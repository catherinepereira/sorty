import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useConfirm } from "../hooks/useConfirm";
import { Header } from "../components/Header";
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
      <Header
        title={`Recycle Bin ${name}`}
        subtitle={`${items.length} in the recycle bin`}
        mood="trash"
        backTo={`/d/${name}`}
        backLabel={`Back to ${name}`}
        actions={
          items.length > 0 && (
            <button
              className="border-bad text-bad hover:bg-bad/10 rounded-lg border px-4 py-2"
              onClick={empty}
            >
              Empty bin
            </button>
          )
        }
      />

      {selected.size > 0 && (
        <div className="border-primary bg-primary-soft mb-4 flex items-center gap-3 rounded-xl border px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            className="bg-primary ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            onClick={restore}
          >
            Restore
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-muted mt-16 text-center">
          The recycle bin is empty.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className={`overflow-hidden rounded-xl border text-left transition ${
                selected.has(item.id)
                  ? "border-primary ring-primary/40 ring-2"
                  : "border-border"
              }`}
            >
              <img
                src={item.url}
                alt={item.subject}
                className="aspect-square w-full object-cover opacity-70"
                loading="lazy"
              />
              <div className="truncate p-2 text-sm">{item.subject}</div>
            </button>
          ))}
        </div>
      )}
      {confirmEl}
    </>
  );
}
