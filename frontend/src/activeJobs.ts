/**
 * Remember the in-flight generate/train job per dataset, so navigating away and back
 * (or a reload) can reattach to the running job instead of losing its progress UI. The
 * job itself runs server-side; this only tracks its id.
 */
const KEY = "sorty.activeJobs";

type Jobs = Record<string, string>;

function read(): Jobs {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function write(jobs: Jobs) {
  localStorage.setItem(KEY, JSON.stringify(jobs));
}

export function setActiveJob(dataset: string, jobId: string) {
  const jobs = read();
  jobs[dataset] = jobId;
  write(jobs);
}

export function getActiveJob(dataset: string): string | null {
  return read()[dataset] ?? null;
}

export function clearActiveJob(dataset: string) {
  const jobs = read();
  delete jobs[dataset];
  write(jobs);
}
