import { useState } from "react";
import { Modal } from "./Modal";
import { api, ApiError } from "../api";
import { ClassEditor } from "./ClassEditor";

/**
 * Two steps: name the dataset (which creates it so class generation has somewhere to
 * resolve against), then define its classes and save. onDone hands back the new slug.
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
  const [prompt, setPrompt] = useState("");
  const [slug, setSlug] = useState("");
  const [classes, setClasses] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("name");
    setName("");
    setPrompt("");
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
      const { name: created } = await api.createDataset(name, prompt);
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
            <input
              className="border-border focus:border-primary w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="Prompt (optional), what the dataset is about"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            {error && <p className="text-bad text-sm">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              className="text-muted hover:text-text px-4 py-2"
              onClick={close}
            >
              Cancel
            </button>
            <button
              className="bg-primary rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
              disabled={!name.trim() || busy}
              onClick={createAndAdvance}
            >
              Next: classes
            </button>
          </div>
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
          <div className="mt-6 flex justify-end gap-3">
            <button
              className="text-muted hover:text-text px-4 py-2"
              onClick={() => onDone(slug)}
            >
              Skip
            </button>
            <button
              className="bg-primary rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
              disabled={busy}
              onClick={finish}
            >
              Save classes
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
