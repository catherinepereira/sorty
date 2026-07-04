export type Mood = "idle" | "working" | "happy" | "trash";

const PRIMARY = "#5b8def";
const ACCENT = "#ffb454";
const DARK = "#334155";

function Eyes({ mood }: { mood: Mood }) {
  if (mood === "happy") {
    return (
      <>
        <path
          d="M20 27 q4 -5 8 0"
          stroke={DARK}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M36 27 q4 -5 8 0"
          stroke={DARK}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }
  if (mood === "working") {
    return (
      <>
        <rect x="20" y="25" width="8" height="4" rx="2" fill={DARK} />
        <rect x="36" y="25" width="8" height="4" rx="2" fill={DARK} />
      </>
    );
  }
  if (mood === "trash") {
    return (
      <>
        <path
          d="M21 24 l6 6 M27 24 l-6 6"
          stroke={DARK}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M37 24 l6 6 M43 24 l-6 6"
          stroke={DARK}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </>
    );
  }
  return (
    <>
      <circle cx="24" cy="27" r="4.5" fill={DARK} />
      <circle cx="40" cy="27" r="4.5" fill={DARK} />
      <circle cx="25.5" cy="25.5" r="1.5" fill="#ffffff" />
      <circle cx="41.5" cy="25.5" r="1.5" fill="#ffffff" />
    </>
  );
}

export function Mascot({
  mood = "idle",
  size = 64,
}: {
  mood?: Mood;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Sorty robot (${mood})`}
      className={mood === "idle" ? "animate-[bob_3s_ease-in-out_infinite]" : ""}
    >
      <line
        x1="32"
        y1="6"
        x2="32"
        y2="14"
        stroke={PRIMARY}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="5" r="3" fill={ACCENT} />
      <rect x="12" y="14" width="40" height="34" rx="12" fill={PRIMARY} />
      <rect x="17" y="19" width="30" height="20" rx="9" fill="#ffffff" />
      <Eyes mood={mood} />
      <rect x="8" y="26" width="4" height="12" rx="2" fill={PRIMARY} />
      <rect x="52" y="26" width="4" height="12" rx="2" fill={PRIMARY} />
    </svg>
  );
}
