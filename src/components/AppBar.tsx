import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { GearIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { SettingsDialog } from "./SettingsDialog";
import { APP_NAME } from "../config";

/**
 * The bar across the top of every page: app name, a breadcrumb for where you are, a
 * short meta line, the page's own actions, then settings and theme
 */
export function AppBar({
  crumbs,
  meta,
  actions,
}: {
  crumbs?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <header className="border-border bg-card flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-6 py-2.5">
      <Link to="/" className="text-base font-bold">
        {APP_NAME}
      </Link>
      {crumbs && (
        <>
          <span className="text-muted" aria-hidden="true">
            /
          </span>
          {crumbs}
        </>
      )}
      {meta && <span className="text-muted">{meta}</span>}
      <div className="flex-1" />
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-muted hover:bg-subtle hover:text-text flex h-8 w-8 items-center justify-center rounded-md"
          title="Settings"
          aria-label="Settings"
        >
          <GearIcon className="h-4 w-4" />
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
