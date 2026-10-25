/**
 * The Sorty mark: four tiles in an S, top pair in the primary color.
 * Same geometry as public/favicon.svg, keep the two in sync
 */
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect
        x="17.5"
        y="9.5"
        width="13"
        height="13"
        rx="3.2"
        className="fill-primary"
      />
      <rect
        x="33.5"
        y="9.5"
        width="13"
        height="13"
        rx="3.2"
        className="fill-primary"
      />
      <rect
        x="1.5"
        y="25.5"
        width="13"
        height="13"
        rx="3.2"
        className="fill-text"
      />
      <rect
        x="17.5"
        y="25.5"
        width="13"
        height="13"
        rx="3.2"
        className="fill-text"
      />
    </svg>
  );
}
