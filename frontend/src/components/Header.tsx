import { useNavigate } from "react-router-dom";
import { Mascot, type Mood } from "./Mascot";
import { APP_NAME } from "../config";

export function Header({
  subtitle,
  mood = "idle",
  backTo,
  actions,
}: {
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
        <h1 className="text-2xl font-bold">{APP_NAME}</h1>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
