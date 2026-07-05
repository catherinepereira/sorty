import { useState } from "react";
import { api } from "../api";
import { prettyClass } from "../classname";
import type { Prediction } from "../types";

export function MismatchPanel({
  datasetName,
  mismatches,
  onClose,
  onChanged,
}: {
  datasetName: string;
  mismatches: Prediction[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const markResolved = (id: string) => setResolved(new Set(resolved).add(id));

  const accept = async (p: Prediction) => {
    await api.setLabel(datasetName, p.id, p.predicted);
    markResolved(p.id);
    onChanged();
  };

  const drop = async (p: Prediction) => {
    await api.del(datasetName, [p.id]);
    markResolved(p.id);
    onChanged();
  };

  const open = mismatches.filter((m) => !resolved.has(m.id));

  return (
    <div className="border-accent bg-card mb-6 rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">
          {open.length === 0
            ? "No label mismatches left"
            : `${open.length} label mismatch${open.length > 1 ? "es" : ""}`}
        </h2>
        <button
          className="text-muted hover:text-text text-sm"
          onClick={onClose}
        >
          Dismiss
        </button>
      </div>
      {open.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {open.map((m) => (
            <div
              key={m.id}
              className="border-border overflow-hidden rounded-lg border"
            >
              <img
                src={m.url}
                alt={prettyClass(m.label)}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              <div className="p-2 text-sm">
                <p>
                  labeled{" "}
                  <span className="font-medium">{prettyClass(m.label)}</span>
                </p>
                <p className="text-accent">predicted {prettyClass(m.predicted)}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    className="bg-primary flex-1 rounded px-2 py-1 text-xs text-white"
                    onClick={() => accept(m)}
                  >
                    Relabel
                  </button>
                  <button
                    className="bg-bad flex-1 rounded px-2 py-1 text-xs text-white"
                    onClick={() => drop(m)}
                  >
                    Bin
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
