import type { JobState } from "../types";

export function JobProgress({ job }: { job: JobState }) {
  const { total, done, message } = job.progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2">
      <span className="font-medium">
        {job.status === "error" ? "Something went wrong" : message || "Working"}
      </span>
      {job.status === "running" && (
        <>
          <div className="bg-subtle h-1.5 min-w-40 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {total > 0 && (
            <span className="text-muted font-mono text-xs">
              {done}/{total}
            </span>
          )}
        </>
      )}
      {job.status === "error" && <span className="text-bad">{job.error}</span>}
    </div>
  );
}
