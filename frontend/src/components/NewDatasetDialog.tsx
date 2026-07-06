import { useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { api, ApiError } from "../api";
import { ClassEditor } from "./ClassEditor";

/**
 * Two steps: name the dataset, then define its classes and save. Naming creates the
 * dataset so the class editor has somewhere to resolve against. onDone hands back the
 * new slug.
 */
export function NewDatasetDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [step, setStep] = useState<"name" | "classes">("name");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [classes, setClasses] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("name");
    setName("");
    setSlug("");
    setClasses([]);
    setError("");
  };

  const close = () => {
    reset();
    onClose();
  };

  const createAndAdvance = async () => {
    setBusy(true);
    setError("");
    try {
      const { name: created } = await api.createDataset(name);
      setSlug(created);
      setStep("classes");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create dataset");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      if (classes.length) await api.setSubjects(slug, classes);
      onDone(slug);
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} width="max-w-xl">
      {step === "name" ? (
        <>
          <h2 className="text-lg font-semibold">New dataset</h2>
          <div className="mt-4 space-y-3">
            <input
              autoFocus
              className="border-border focus:border-primary w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="Name, e.g. Pacific NW birds"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && name.trim() && createAndAdvance()
              }
            />
            {error && <p className="text-bad text-sm">{error}</p>}
          </div>
          <ModalActions
            actionLabel="Next: classes"
            disabled={!name.trim() || busy}
            onCancel={close}
            onAction={createAndAdvance}
          />
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Classes for {slug}</h2>
          <p className="text-muted mt-1 text-sm">
            Define the classes now, or skip and add them later. No images are
            fetched yet.
          </p>
          <div className="mt-4">
            <ClassEditor
              datasetName={slug}
              classes={classes}
              setClasses={setClasses}
            />
          </div>
          <ModalActions
            cancelLabel="Skip"
            actionLabel="Save classes"
            disabled={busy}
            onCancel={() => onDone(slug)}
            onAction={finish}
          />
        </>
      )}
    </Modal>
  );
}
