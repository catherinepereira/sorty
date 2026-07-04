import { Mascot } from "./Mascot";
import type { JobState } from "../types";

export function JobProgress({ job }: { job: JobState }) {
  const { total, done, message } = job.progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const mood =
    job.status === "done"
      ? "happy"
      : job.status === "error"
        ? "trash"
        : "working";

  return (
    <div className="border-border bg-card flex items-center gap-4 rounded-xl border p-4">
      <Mascot mood={mood} size={48} />
      <div className="flex-1">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            {job.status === "error"
              ? "Something went wrong"
              : message || "Working"}
          </span>
          {job.status === "running" && total > 0 && (
            <span className="text-muted">
              {done}/{total}
            </span>
          )}
        </div>
        {job.status === "running" && (
          <div className="bg-bg mt-2 h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {job.status === "error" && (
          <p className="text-bad mt-1 text-sm">{job.error}</p>
        )}
      </div>
    </div>
  );
}
