import type { ModelReport } from "../api";
import { ToolButton } from "./DatasetToolsPanel";
import { BrainIcon, DownloadIcon } from "./icons";
import { prettyClass } from "../classname";

const MODEL_NAMES: Record<string, string> = {
  mobilenet_v2: "MobileNet V2",
  resnet18: "ResNet-18",
  resnet50: "ResNet-50",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Training actions plus the last trained model's report: latest-run settings, confusion
 * matrix, per-class metrics, and a comparison table across runs. Only the latest run's
 * weights exist on disk, so that's what the export downloads.
 */
export function TrainingPanel({
  busy,
  report,
  runs,
  onTrain,
  exportUrl,
}: {
  // a job is running, disable the buttons that would start another
  busy: boolean;
  report: ModelReport | null;
  runs: ModelReport[];
  onTrain: () => void;
  exportUrl: string;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <ToolButton
          label="Train model"
          icon={<BrainIcon className="h-5 w-5" />}
          onClick={onTrain}
          disabled={busy}
        />
      </div>

      {!report && (
        <p className="text-muted text-sm">
          No model trained yet. Train one to see its report here.
        </p>
      )}

      {report && (
        <>
          <hr className="border-border" />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Latest run</h3>
              <dl className="w-80 max-w-full space-y-1 text-sm">
                <Row
                  label="Model"
                  value={MODEL_NAMES[report.model] ?? report.model}
                />
                <Row
                  label="Trained"
                  value={new Date(report.trained_at * 1000).toLocaleString()}
                />
                <Row
                  label="Images"
                  value={`${report.n_train} training, ${report.n_val} validation`}
                />
                <Row
                  label="Scope"
                  value={report.valid_only ? "Valid images only" : "All images"}
                />
                <Row label="Epochs" value={String(report.epochs)} />
                <Row label="Learning rate" value={report.lr.toExponential(2)} />
                <Row
                  label="Validation accuracy"
                  value={pct(report.overall_accuracy)}
                />
              </dl>
            </div>
            <a
              href={exportUrl}
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            >
              <DownloadIcon className="h-4 w-4" />
              Export model
            </a>
          </div>

          {report.confusion && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Confusion matrix</h3>
              <ConfusionMatrix confusion={report.confusion} />
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Per-class metrics</h3>
            <table className="w-full max-w-xl text-sm">
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
                  .map(([cls, m]) => (
                    <tr key={cls}>
                      <td className="max-w-48 truncate py-1">
                        {prettyClass(cls)}
                      </td>
                      <td className="py-1 text-right">{pct(m.precision)}</td>
                      <td className="py-1 text-right">{pct(m.recall)}</td>
                      <td className="py-1 text-right">{pct(m.f1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {runs.length > 1 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                Runs ({runs.length})
              </h3>
              <RunsTable runs={runs} />
            </div>
          )}
        </>
      )}
    </div>
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

/**
 * Rows are the labeled class, columns the predicted class, over the validation split.
 * Cells shade green on the diagonal (agreement) and red off it, scaled by the share of
 * that row's images.
 */
function ConfusionMatrix({
  confusion,
}: {
  confusion: { labels: string[]; matrix: number[][] };
}) {
  const { labels, matrix } = confusion;
  const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));

  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="text-muted p-1 pr-3 text-left font-normal">
              True \ Predicted
            </th>
            {labels.map((l) => (
              <th
                key={l}
                className="text-muted max-w-24 truncate p-1 text-left font-normal"
                title={prettyClass(l)}
              >
                {prettyClass(l)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th
                className="text-muted max-w-32 truncate p-1 pr-3 text-left font-normal"
                title={prettyClass(labels[i])}
              >
                {prettyClass(labels[i])}
              </th>
              {row.map((count, j) => {
                const share = rowTotals[i] ? count / rowTotals[i] : 0;
                const tone = i === j ? "--color-good" : "--color-bad";
                return (
                  <td
                    key={labels[j]}
                    className="min-w-10 p-1 text-center tabular-nums"
                    style={
                      count
                        ? {
                            background: `color-mix(in srgb, var(${tone}) ${Math.round(share * 75)}%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    {count || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted mt-2 text-xs">
        Counts from the validation split. The diagonal is images predicted as
        their own class.
      </p>
    </div>
  );
}

function RunsTable({ runs }: { runs: ModelReport[] }) {
  const best = Math.max(...runs.map((r) => r.overall_accuracy));
  return (
    <table className="w-full max-w-3xl text-sm">
      <thead>
        <tr className="text-muted text-left">
          <th className="py-1 font-medium">Trained</th>
          <th className="py-1 font-medium">Model</th>
          <th className="py-1 text-right font-medium">Images</th>
          <th className="py-1 text-right font-medium">Epochs</th>
          <th className="py-1 pl-6 font-medium">Scope</th>
          <th className="py-1 text-right font-medium">Accuracy</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.trained_at}>
            <td className="py-1">
              {new Date(r.trained_at * 1000).toLocaleString()}
            </td>
            <td className="py-1">{MODEL_NAMES[r.model] ?? r.model}</td>
            <td className="py-1 text-right">{r.n_train + r.n_val}</td>
            <td className="py-1 text-right">{r.epochs}</td>
            <td className="py-1 pl-6">{r.valid_only ? "Valid only" : "All"}</td>
            <td
              className={`py-1 text-right ${
                r.overall_accuracy === best ? "text-good font-medium" : ""
              }`}
            >
              {pct(r.overall_accuracy)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
