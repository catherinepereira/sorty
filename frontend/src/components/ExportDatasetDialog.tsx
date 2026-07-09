import { useEffect, useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { Segmented } from "./Segmented";
import { api } from "../api";
import type { DatasetSummaryStats } from "../types";
import { prettyClass } from "../classname";
import { humanBytes } from "../format";

/**
 * A summary of what the dataset export contains, with layout options and a download
 * button. Flat exports keep the class folders and include the manifest, so statuses and
 * predictions survive a re-import. Train/test exports use a seeded per-class split
 * instead, every class with at least two images lands on both sides.
 */
export function ExportDatasetDialog({
  open,
  datasetName,
  counts,
  onClose,
}: {
  open: boolean;
  datasetName: string;
  counts: { total: number; pending: number; valid: number };
  onClose: () => void;
}) {
  const [stats, setStats] = useState<DatasetSummaryStats | null>(null);
  const [layout, setLayout] = useState<"flat" | "split">("flat");
  const [testPercent, setTestPercent] = useState(20);
  const [seed, setSeed] = useState(42);

  useEffect(() => {
    if (open)
      api
        .getSummary(datasetName)
        .then(setStats)
        .catch(() => {});
  }, [open, datasetName]);

  const split = layout === "split";
  const ready = !split || (testPercent >= 1 && testPercent <= 90);

  const download = () => {
    const params = split ? `?test_percent=${testPercent}&seed=${seed}` : "";
    window.location.href = `/api/datasets/${datasetName}/export${params}`;
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">Export dataset</h2>
      <p className="text-muted mt-1 text-sm">
        Downloads a zip of the dataset. Images in the recycle bin are left out.
      </p>

      <dl className="mt-5 space-y-1 text-sm">
        <Row label="Images" value={String(counts.total)} />
        <Row
          label="Reviewed"
          value={`${counts.valid} reviewed, ${counts.pending} unreviewed`}
        />
        <Row label="Classes" value={stats ? String(stats.subjects) : "…"} />
        <Row
          label="On disk"
          value={stats ? humanBytes(stats.bytes_total) : "…"}
        />
      </dl>

      {stats && stats.per_class.length > 0 && (
        <>
          <hr className="border-border mt-4" />
          <ul className="text-muted mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
            {stats.per_class.map((c) => (
              <li key={c.name} className="flex justify-between gap-4">
                <span className="truncate">{prettyClass(c.name)}</span>
                <span>{c.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr className="border-border mt-4" />

      <div className="mt-4 space-y-3">
        <p className="text-sm font-medium">Layout</p>
        <Segmented
          value={layout}
          options={[
            { value: "flat", label: "Class folders" },
            { value: "split", label: "Train + test split" },
          ]}
          onChange={(v) => setLayout(v as "flat" | "split")}
        />
        {split ? (
          <>
            <div className="flex flex-wrap gap-6">
              <label className="text-muted flex items-center gap-2 text-sm">
                Test share (%)
                <input
                  type="number"
                  min={1}
                  max={90}
                  className="border-border w-20 rounded-lg border px-2 py-1"
                  value={testPercent}
                  onChange={(e) => setTestPercent(Number(e.target.value))}
                />
              </label>
              <label className="text-muted flex items-center gap-2 text-sm">
                Seed
                <input
                  type="number"
                  className="border-border w-24 rounded-lg border px-2 py-1"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                />
              </label>
            </div>
            <p className="text-muted text-sm">
              Splits each class separately with the seed, so the same seed
              always gives the same split. Every class with at least two images
              keeps at least one on each side. The manifest is left out since
              its paths describe the flat layout.
            </p>
          </>
        ) : (
          <p className="text-muted text-sm">
            Keeps the class folders and includes the manifest, so statuses and
            predictions survive a re-import.
          </p>
        )}
      </div>

      <ModalActions
        actionLabel="Download"
        disabled={!ready}
        onCancel={onClose}
        onAction={download}
      />
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
