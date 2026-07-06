import { useEffect, useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { api } from "../api";
import type { DatasetSummaryStats } from "../types";
import { prettyClass } from "../classname";
import { humanBytes } from "../format";

/**
 * A summary of what the dataset export contains, with a download button. The zip holds
 * the class folders of images plus the manifest, so statuses and predictions survive
 * a re-import.
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

  useEffect(() => {
    if (open)
      api
        .getSummary(datasetName)
        .then(setStats)
        .catch(() => {});
  }, [open, datasetName]);

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">Export dataset</h2>
      <p className="text-muted mt-1 text-sm">
        Downloads a zip of the class folders and the manifest. Images in the
        recycle bin are left out.
      </p>

      <dl className="mt-5 space-y-1 text-sm">
        <Row label="Images" value={String(counts.total)} />
        <Row
          label="Reviewed"
          value={`${counts.valid} valid, ${counts.pending} unreviewed`}
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
          <ul className="text-muted mt-3 max-h-60 space-y-1 overflow-y-auto text-sm">
            {stats.per_class.map((c) => (
              <li key={c.name} className="flex justify-between gap-4">
                <span className="truncate">{prettyClass(c.name)}</span>
                <span>{c.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <ModalActions
        actionLabel="Download"
        onCancel={onClose}
        onAction={() => {
          window.location.href = `/api/datasets/${datasetName}/export`;
        }}
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
