import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mascot, type Mood } from "./Mascot";
import { BackIcon, GearIcon, HomeIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { SettingsDialog } from "./SettingsDialog";
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
  title?: React.ReactNode;
  titleAction?: React.ReactNode;
  subtitle?: string;
  mood?: Mood;
  backTo?: string;
  // "Home" shows the house icon and goes home, anything else shows a back arrow
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  const nav = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      {/* one flex row for every header button, so the gaps all match the action groups */}
      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={() => setSettingsOpen(true)}
          className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 flex h-10 w-10 items-center justify-center rounded-lg border"
          title="Settings"
          aria-label="Settings"
        >
          <GearIcon className="h-5 w-5" />
        </button>
        <ThemeToggle />
      </div>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </header>
  );
}
