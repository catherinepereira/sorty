import { useEffect, useMemo, useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { Segmented } from "./Segmented";
import { api, ApiError } from "../api";
import { prettyClass } from "../classname";
import type { Item } from "../types";

type SourceInfo = { name: string; requires_contact: boolean };

// matches TrainDialog: below this many images a class trains poorly
const LOW_COUNT = 10;

/**
 * Fetch images for a dataset. Pick specific classes or leave the picker empty for all,
 * and choose how many to pull per class (added on top, or a total to top up to).
 * Repeated runs page deeper and skip URLs already downloaded, so a fetch never silently
 * no-ops.
 */
export function GenerateDialog({
  open,
  classes,
  items,
  onClose,
  onStart,
}: {
  open: boolean;
  classes: string[];
  items: Item[];
  onClose: () => void;
  onStart: (body: {
    subjects?: string[];
    sources: string[];
    count: number;
    target_total: boolean;
  }) => void;
}) {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [contactSet, setContactSet] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [chosenSources, setChosenSources] = useState<Set<string>>(new Set());
  const [chosenClasses, setChosenClasses] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(20);
  const [countMode, setCountMode] = useState<"add" | "total">("add");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.label, (m.get(i.label) ?? 0) + 1);
    return m;
  }, [items]);

  useEffect(() => {
    if (!open) return;
    api.sources().then((r) => {
      setSources(r.sources);
      setContactSet(r.contact_set);
      // default to the first source that needs no setup
      const first = r.sources.find((s) => r.contact_set || !s.requires_contact);
      setChosenSources(new Set(first ? [first.name] : []));
    });
    setChosenClasses(new Set());
    setEmail("");
    setEmailError("");
  }, [open]);

  const saveContact = async () => {
    setEmailError("");
    try {
      await api.setContact(email);
      setContactSet(true);
    } catch (e) {
      setEmailError(
        e instanceof ApiError ? e.message : "Could not save the email",
      );
    }
  };

  const toggle = (
    set: Set<string>,
    key: string,
    setter: (s: Set<string>) => void,
  ) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const start = () => {
    onStart({
      subjects: chosenClasses.size ? [...chosenClasses] : undefined,
      sources: [...chosenSources],
      count,
      target_total: countMode === "total",
    });
  };

  const ready = chosenSources.size > 0 && classes.length > 0;

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">Generate images</h2>

      <div className="mt-5 space-y-5">
        {classes.length > 0 && (
          <div>
            <p className="text-sm font-medium">
              Classes{" "}
              <span className="text-muted">
                {chosenClasses.size ? `(${chosenClasses.size})` : "(all)"}
              </span>
            </p>
            <div className="mt-1 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
              {classes.map((c) => {
                const n = counts.get(c) ?? 0;
                return (
                  <button
                    key={c}
                    onClick={() => toggle(chosenClasses, c, setChosenClasses)}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-left text-sm ${
                      chosenClasses.has(c)
                        ? "border-primary bg-primary/10"
                        : "border-border text-muted hover:border-primary"
                    }`}
                  >
                    <span className="truncate">{prettyClass(c)}</span>
                    <span className={n < LOW_COUNT ? "text-bad" : "text-muted"}>
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {classes.length === 0 && (
          <p className="text-muted text-sm">
            No classes yet. Add some in the Summary panel first.
          </p>
        )}

        <hr className="border-border" />

        <div>
          <p className="text-sm font-medium">Sources</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {sources.map((s) => {
              const locked = s.requires_contact && !contactSet;
              return (
                <button
                  key={s.name}
                  disabled={locked}
                  onClick={() =>
                    toggle(chosenSources, s.name, setChosenSources)
                  }
                  title={
                    locked
                      ? `${s.name} asks API users for a contact email. Set one below to enable it.`
                      : undefined
                  }
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    chosenSources.has(s.name)
                      ? "bg-primary text-white"
                      : "border-border text-muted border"
                  } ${locked ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          {sources.some((s) => s.requires_contact) && !contactSet && (
            <div className="mt-3">
              <p className="text-muted text-sm">
                Grayed sources ask API users for a contact email. Set one to
                enable them (saved to .env).
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  className="border-border focus:border-primary flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && email.trim() && saveContact()
                  }
                />
                <button
                  onClick={saveContact}
                  disabled={!email.trim()}
                  className="bg-primary rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              {emailError && (
                <p className="text-bad mt-1 text-sm">{emailError}</p>
              )}
            </div>
          )}
        </div>

        <hr className="border-border" />

        <div className="space-y-2">
          <Segmented
            value={countMode}
            options={[
              { value: "add", label: "Add per class" },
              { value: "total", label: "Total per class" },
            ]}
            onChange={(v) => setCountMode(v as "add" | "total")}
          />
          <label className="text-muted flex items-center gap-2 text-sm">
            {countMode === "add"
              ? "New images per class"
              : "Target total per class"}
            <input
              type="number"
              min={1}
              max={200}
              className="border-border w-20 rounded-lg border px-2 py-1"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      <ModalActions
        actionLabel="Generate"
        disabled={!ready}
        onCancel={onClose}
        onAction={start}
      />
    </Modal>
  );
}
