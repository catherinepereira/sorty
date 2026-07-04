import { useEffect, useState } from "react";
import { api } from "../api";
import type { DatasetSummaryStats } from "../types";
import { Modal } from "./Modal";

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

export function SummaryPanel({
  datasetName,
  onClose,
}: {
  datasetName: string;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<DatasetSummaryStats | null>(null);

  useEffect(() => {
    api.getSummary(datasetName).then(setStats);
  }, [datasetName]);

  return (
    <Modal open onClose={onClose} width="max-w-2xl">
      <h2 className="text-lg font-semibold">Summary</h2>
      {!stats ? (
        <p className="text-muted mt-4">Loading</p>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="flex gap-6 text-sm">
            <Stat label="Images" value={stats.total} />
            <Stat label="Classes" value={stats.subjects} />
            <Stat label="On disk" value={humanBytes(stats.bytes_total)} />
          </div>

          <Section title="Per class">
            <CountList rows={stats.per_class} />
          </Section>

          <Section title="Per source">
            <CountList rows={stats.per_source} />
          </Section>

          {stats.image_sizes && (
            <Section title="Image sizes">
              <p className="text-muted text-sm">
                {stats.image_sizes.min_width}×{stats.image_sizes.min_height} to{" "}
                {stats.image_sizes.max_width}×{stats.image_sizes.max_height},
                mean {stats.image_sizes.mean_width}×
                {stats.image_sizes.mean_height} ({stats.image_sizes.measured}{" "}
                measured)
              </p>
            </Section>
          )}
        </div>
      )}
      <div className="mt-6 flex justify-end">
        <button
          className="bg-primary rounded-lg px-4 py-2 font-medium text-white"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-muted">{label}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function CountList({ rows }: { rows: { name: string; count: number }[] }) {
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.name} className="flex justify-between text-sm">
          <span className="text-muted">{r.name}</span>
          <span>{r.count}</span>
        </div>
      ))}
    </div>
  );
}
