import type { Status } from "./types";

// "pending" and "valid" are the stored values, the UI reads them as review states
const LABELS: Record<Status, string> = {
  pending: "Unreviewed",
  valid: "Reviewed",
  invalid: "Invalid",
};

export function statusLabel(status: Status): string {
  return LABELS[status] ?? status;
}
