import { useEffect, useRef, useState } from "react";
import { CaretIcon } from "./icons";
import { btn } from "../ui";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
};

/** A toolbar button that opens a list of less-used actions */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className={btn}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <CaretIcon
          className={`text-muted h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul
          role="menu"
          className="border-border bg-card absolute right-0 z-20 mt-1 min-w-44 rounded-lg border py-1 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                role="menuitem"
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="hover:bg-subtle block w-full px-3 py-2 text-left whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
