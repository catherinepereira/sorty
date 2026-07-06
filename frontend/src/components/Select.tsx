import { useEffect, useRef, useState } from "react";
import { CaretIcon } from "./icons";

export type Option = { value: string; label: string };

/**
 * A token-styled dropdown that themes with light and dark mode, unlike a native
 * <select> whose option list keeps the OS background. Pass value="" with a placeholder
 * to use it as an action menu that never shows a persistent selection.
 */
export function Select({
  value,
  options,
  placeholder,
  onChange,
  className = "",
}: {
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}) {
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

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border-border bg-card hover:border-primary flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm"
      >
        <span className={current ? "" : "text-muted"}>
          {current ? current.label : placeholder}
        </span>
        <CaretIcon
          className={`text-muted h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="border-border bg-card absolute z-20 mt-1 max-h-56 min-w-full overflow-y-auto rounded-lg border py-1 shadow-lg">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`hover:bg-bg block w-full px-3 py-1.5 text-left text-sm ${
                  o.value === value ? "text-primary" : ""
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
