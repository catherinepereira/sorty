import { Modal, ModalActions } from "./Modal";
import type { ModelReport } from "../api";
import { prettyClass } from "../classname";

const MODEL_NAMES: Record<string, string> = {
  mobilenet_v2: "MobileNet V2",
  resnet18: "ResNet-18",
  resnet50: "ResNet-50",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * The saved model's training report with a download button. The zip holds the
 * TorchScript weights, the class order, and this report.
 */
export function ModelExportDialog({
  open,
  report,
  exportUrl,
  onClose,
}: {
  open: boolean;
  report: ModelReport | null;
  exportUrl: string;
  onClose: () => void;
}) {
  if (!report) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">Export model</h2>
      <p className="text-muted mt-1 text-sm">
        Downloads a zip with the TorchScript model, class order, and this
        training report.
      </p>

      <dl className="mt-5 space-y-1 text-sm">
        <Row label="Model" value={MODEL_NAMES[report.model] ?? report.model} />
        <Row
          label="Trained"
          value={new Date(report.trained_at * 1000).toLocaleString()}
        />
        <Row
          label="Images"
          value={`${report.n_train} training, ${report.n_val} validation`}
        />
        <Row label="Epochs" value={String(report.epochs)} />
        <Row label="Learning rate" value={report.lr.toExponential(2)} />
        <Row label="Validation accuracy" value={pct(report.overall_accuracy)} />
      </dl>

      <hr className="border-border mt-4" />

      <div className="mt-3 max-h-60 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-left">
              <th className="py-1 font-medium">Class</th>
              <th className="py-1 text-right font-medium">Precision</th>
              <th className="py-1 text-right font-medium">Recall</th>
              <th className="py-1 text-right font-medium">F1</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(report.per_class)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, m]) => (
                <tr key={name}>
                  <td className="max-w-48 truncate py-1">
                    {prettyClass(name)}
                  </td>
                  <td className="py-1 text-right">{pct(m.precision)}</td>
                  <td className="py-1 text-right">{pct(m.recall)}</td>
                  <td className="py-1 text-right">{pct(m.f1)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <ModalActions
        actionLabel="Download"
        onCancel={onClose}
        onAction={() => {
          window.location.href = exportUrl;
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
