import { useNavigate } from "react-router-dom";
import { Mascot, type Mood } from "./Mascot";
import { BackIcon, HomeIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { APP_NAME } from "../config";

export function Header({
  title = APP_NAME,
  titleAction,
  subtitle,
  mood = "idle",
  backTo,
  backLabel = "Home",
  actions,
}: {
  title?: string;
  titleAction?: React.ReactNode;
  subtitle?: string;
  mood?: Mood;
  backTo?: string;
  // "Home" shows the house icon and goes home, anything else shows a back arrow
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  const nav = useNavigate();
  const isHome = backLabel === "Home";
  return (
    <header className="mb-6 flex items-center gap-4">
      {backTo && (
        <button
          className="text-muted hover:bg-card flex h-10 w-10 items-center justify-center rounded-lg"
          onClick={() => nav(backTo)}
          aria-label={backLabel}
          title={backLabel}
        >
          {isHome ? (
            <HomeIcon className="h-5 w-5" />
          ) : (
            <BackIcon className="h-5 w-5" />
          )}
        </button>
      )}
      <Mascot mood={mood} size={56} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          {titleAction}
        </div>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {actions}
      <ThemeToggle />
    </header>
  );
}
