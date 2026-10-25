import { useState } from "react";
import { Modal, ModalActions } from "./Modal";

/**
 * Organize the dataset into train/test(/valid) split folders with a seeded per-class
 * assignment. Re-running with new percentages or a new seed reshuffles every image,
 * including ones already in a split.
 */
export function CreateSplitsDialog({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (body: {
    test_percent: number;
    valid_percent: number;
    seed: number;
  }) => void;
}) {
  const [testPercent, setTestPercent] = useState(20);
  const [validPercent, setValidPercent] = useState(0);
  const [seed, setSeed] = useState(42);

  const ready =
    testPercent >= 1 &&
    testPercent <= 90 &&
    validPercent >= 0 &&
    validPercent <= 50 &&
    testPercent + validPercent <= 90;

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">Create splits</h2>
      <p className="text-muted mt-1 text-sm">
        Moves every image into train/, test/, and optionally valid/ folders,
        assigned per class with the seed. Images already in a split are
        reshuffled too.
      </p>

      <div className="mt-5 flex flex-wrap gap-6">
        <NumberField
          label="Test share (%)"
          value={testPercent}
          min={1}
          max={90}
          onChange={setTestPercent}
        />
        <NumberField
          label="Valid share (%)"
          value={validPercent}
          min={0}
          max={50}
          onChange={setValidPercent}
        />
        <NumberField
          label="Seed"
          value={seed}
          min={0}
          max={999999}
          onChange={setSeed}
        />
      </div>

      <p className="text-muted mt-4 text-sm">
        The same seed always gives the same split. Every class with at least two
        images keeps at least one in train and one in test, the valid share only
        takes what's left. Set the valid share to 0 for a plain train/test
        split.
      </p>

      <ModalActions
        actionLabel="Create splits"
        disabled={!ready}
        onCancel={onClose}
        onAction={() =>
          onStart({
            test_percent: testPercent,
            valid_percent: validPercent,
            seed,
          })
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
        className="border-border w-24 rounded-lg border px-2 py-1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
