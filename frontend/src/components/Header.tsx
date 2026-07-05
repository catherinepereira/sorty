import { useNavigate } from "react-router-dom";
import { Mascot, type Mood } from "./Mascot";
import { APP_NAME } from "../config";

export function Header({
  title = APP_NAME,
  titleAction,
  subtitle,
  mood = "idle",
  backTo,
  actions,
}: {
  title?: string;
  titleAction?: React.ReactNode;
  subtitle?: string;
  mood?: Mood;
  backTo?: string;
  actions?: React.ReactNode;
}) {
  const nav = useNavigate();
  return (
    <header className="mb-6 flex items-center gap-4">
      {backTo && (
        <button
          className="text-muted hover:bg-card rounded-full px-3 py-2"
          onClick={() => nav(backTo)}
          aria-label="Back"
        >
          ←
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
    </header>
  );
}
