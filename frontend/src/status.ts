import type { Status } from "./types";

// "pending" is the stored value, the UI calls it "Unreviewed"
const LABELS: Record<Status, string> = {
  pending: "Unreviewed",
  valid: "Valid",
  invalid: "Invalid",
};

export function statusLabel(status: Status): string {
  return LABELS[status] ?? status;
}
