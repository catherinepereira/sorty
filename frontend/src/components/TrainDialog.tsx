import { useMemo, useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { Segmented } from "./Segmented";
import { Select } from "./Select";
import { prettyClass } from "../classname";
import type { Item } from "../types";

export interface TrainConfig {
  model: string;
  folds: number;
  epochs: number;
  valid_only: boolean;
}

const MODELS = [
  { value: "mobilenet_v2", label: "MobileNet V2 (fastest)" },
  { value: "resnet18", label: "ResNet-18" },
  { value: "resnet50", label: "ResNet-50 (slowest)" },
];

// below this many images a class trains poorly, flag it
const LOW_COUNT = 10;

const COPY = {
  crossval: {
    title: "Cross validate",
    blurb:
      "Cross-validates over the dataset, so every image is predicted by a fold that never trained on it.",
    action: "Cross validate",
  },
  train: {
    title: "Train model",
    blurb:
      "Trains one model on the chosen images and saves it, ready to export from the Tools panel.",
    action: "Train",
  },
};

/**
 * Configure a training run: backbone, epochs, folds (cross-validation only), and
 * whether to use every image or only the reviewed-valid ones. The per-class list shows
 * what each class contributes under the chosen scope, since a class with few images
 * trains poorly.
 */
export function TrainDialog({
  open,
  mode,
  items,
  onClose,
  onStart,
}: {
  open: boolean;
  mode: "crossval" | "train";
  items: Item[];
  onClose: () => void;
  onStart: (body: TrainConfig) => void;
}) {
  const [model, setModel] = useState("mobilenet_v2");
  const [folds, setFolds] = useState(5);
  const [epochs, setEpochs] = useState(8);
  const [scope, setScope] = useState<"all" | "valid">("all");

  const classCounts = useMemo(() => {
    const counts = new Map<string, { total: number; valid: number }>();
    for (const i of items) {
      const c = counts.get(i.label) ?? { total: 0, valid: 0 };
      c.total += 1;
      if (i.status === "valid") c.valid += 1;
      counts.set(i.label, c);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const crossval = mode === "crossval";
  const validOnly = scope === "valid";
  // counts under the chosen scope, so the list and warnings match what would train
  const scoped = classCounts.map(
    ([label, c]) => [label, validOnly ? c.valid : c.total] as const,
  );
  const empty = scoped.filter(([, n]) => n === 0);
  const low = scoped.filter(([, n]) => n > 0 && n < LOW_COUNT);
  const total = scoped.reduce((n, [, c]) => n + c, 0);

  const ready =
    epochs >= 1 &&
    epochs <= 50 &&
    (crossval ? folds >= 2 && folds <= 10 && total >= folds : total >= 2);

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">{COPY[mode].title}</h2>
      <p className="text-muted mt-1 text-sm">{COPY[mode].blurb}</p>

      <div className="mt-5 min-h-96 space-y-5">
        <div className="flex items-center gap-3">
          <span className="w-16 text-sm font-medium">Model</span>
          <Select
            className="w-56"
            value={model}
            placeholder="Model"
            options={MODELS}
            onChange={setModel}
          />
        </div>

        <hr className="border-border" />

        <div className="flex flex-wrap gap-6">
          {crossval && (
            <NumberField
              label="Folds"
              value={folds}
              min={2}
              max={10}
              onChange={setFolds}
            />
          )}
          <NumberField
            label={crossval ? "Epochs per fold" : "Epochs"}
            value={epochs}
            min={1}
            max={50}
            onChange={setEpochs}
          />
        </div>

        <hr className="border-border" />

        <div>
          <p className="text-sm font-medium">Images</p>
          <div className="mt-2">
            <Segmented
              value={scope}
              options={[
                { value: "all", label: "All images" },
                { value: "valid", label: "Valid only" },
              ]}
              onChange={(v) => setScope(v as "all" | "valid")}
            />
          </div>

          <div className="mt-3">
            <ul className="text-muted max-h-72 space-y-1 overflow-y-auto text-sm">
              {scoped.map(([label, n]) => (
                <li key={label} className="flex justify-between gap-4">
                  <span>{prettyClass(label)}</span>
                  <span className={n < LOW_COUNT ? "text-bad" : ""}>
                    {n} {validOnly ? "valid" : "images"}
                  </span>
                </li>
              ))}
            </ul>
            {empty.length > 0 && (
              <p className="text-bad mt-2 text-sm">
                {empty.length === 1
                  ? `${prettyClass(empty[0][0])} has no ${validOnly ? "valid " : ""}images and would be left out of training.`
                  : `${empty.length} classes have no ${validOnly ? "valid " : ""}images and would be left out of training.`}
              </p>
            )}
            {low.length > 0 && (
              <p className="text-warn mt-2 text-sm">
                {low.length === 1
                  ? `${prettyClass(low[0][0])} has fewer than ${LOW_COUNT} ${validOnly ? "valid " : ""}images, which trains poorly.`
                  : `${low.length} classes have fewer than ${LOW_COUNT} ${validOnly ? "valid " : ""}images, which trains poorly.`}
              </p>
            )}
          </div>
        </div>
      </div>

      <ModalActions
        actionLabel={COPY[mode].action}
        disabled={!ready}
        onCancel={onClose}
        onAction={() =>
          onStart({ model, folds, epochs, valid_only: validOnly })
        }
      />
    </Modal>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="text-muted flex items-center gap-2 text-sm">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        className="border-border w-20 rounded-lg border px-2 py-1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
