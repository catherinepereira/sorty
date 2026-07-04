import { useState } from "react";
import { Modal } from "./Modal";

export function NewDatasetDialog({
  open,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  error: string;
  onClose: () => void;
  onCreate: (name: string, prompt: string) => void;
}) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">New dataset</h2>
      <div className="mt-4 space-y-3">
        <input
          autoFocus
          className="border-border focus:border-primary w-full rounded-lg border px-3 py-2 outline-none"
          placeholder="Name, e.g. Pacific NW birds"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="bg-primary rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
          disabled={!name.trim()}
          onClick={() => onCreate(name, prompt)}
        >
          Create
        </button>
      </div>
    </Modal>
  );
}
