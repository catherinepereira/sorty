/**
 * In-page background jobs with polled progress, mirroring sorty/jobs.py
 *
 * Jobs run as async tasks in this tab and the UI polls them through api.job, the
 * same shape the desktop JobManager serves. Reloading the page drops them
 */

import type { JobState } from "../types";
import { notFound } from "./errors";

export interface JobProgress {
  total: number;
  done: number;
  message: string;
}

export class Progress {
  total = 0;
  done = 0;
  message = "";

  start(total: number, message: string) {
    this.total = Math.max(total, 1);
    this.done = 0;
    this.message = message;
  }

  advance(message?: string, step = 1) {
    this.done = Math.min(this.done + step, this.total);
    if (message !== undefined) this.message = message;
  }

  set(message: string) {
    this.message = message;
  }

  view(): JobProgress {
    return { total: this.total, done: this.done, message: this.message };
  }
}

const jobs = new Map<
  string,
  {
    progress: Progress;
    status: JobState["status"];
    result?: unknown;
    error?: string;
  }
>();

export function submit(work: (p: Progress) => Promise<unknown>): string {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const job = {
    progress: new Progress(),
    status: "running" as JobState["status"],
    result: undefined as unknown,
    error: undefined as string | undefined,
  };
  jobs.set(id, job);
  work(job.progress).then(
    (result) => {
      job.result = result;
      job.status = "done";
    },
    (e: unknown) => {
      console.error(e);
      job.error = e instanceof Error ? e.message : String(e);
      job.status = "error";
    },
  );
  return id;
}

// a reload kills running jobs mid-write, so ask before leaving
window.addEventListener("beforeunload", (e) => {
  if ([...jobs.values()].some((j) => j.status === "running"))
    e.preventDefault();
});

export function view(id: string): JobState {
  const job = jobs.get(id);
  if (!job) throw notFound("No such job");
  const progress = job.progress.view();
  if (job.status === "done")
    return { id, status: "done", progress, result: job.result };
  if (job.status === "error")
    return { id, status: "error", progress, error: job.error ?? "" };
  return { id, status: "running", progress };
}

/** Yield to the event loop so long loops keep the page responsive */
export const yieldToUi = () => new Promise((r) => setTimeout(r, 0));
