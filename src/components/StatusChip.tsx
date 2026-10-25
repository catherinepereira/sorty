import type { Status } from "../types";
import { statusLabel } from "../status";

const STYLES: Record<Status, string> = {
  valid: "bg-good-soft text-good",
  invalid: "bg-bad/10 text-bad",
  pending: "bg-subtle text-pending",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STYLES[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}
