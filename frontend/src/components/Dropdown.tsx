import { useEffect, useRef, useState, type ReactNode } from "react";

export function Dropdown({
  label,
  children,
}: {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-card rounded-lg px-4 py-2 font-medium shadow-sm hover:shadow"
      >
        {label}
      </button>
      {open && (
        <div className="border-border bg-card absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border py-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`hover:bg-bg block w-full px-4 py-2 text-left text-sm ${
        danger ? "text-bad" : ""
      }`}
    >
      {children}
    </button>
  );
}
