import type { Status } from "../types";

const STYLES: Record<Status, string> = {
  valid: "bg-good/15 text-good",
  invalid: "bg-bad/15 text-bad",
  pending: "bg-pending/30 text-muted",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
