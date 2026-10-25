import { useEffect, useMemo, useRef, useState } from "react";
import type { Upload } from "../api";
import { collectDropped, collectPicked } from "../dropped";
import { prettyClass } from "../classname";
import { slugify } from "../local/ids";
import { IMAGE_EXTS } from "../local/images";
import { Modal, ModalActions } from "./Modal";
import { btn, field } from "../ui";

const FROM_FOLDERS = "__folders__";
const NEW_CLASS = "__new__";

const isImage = (path: string) =>
  IMAGE_EXTS.has(path.slice(path.lastIndexOf(".")).toLowerCase());

// folders when the selection has them, else the first class
const defaultTarget = (uploads: Upload[], classes: string[]) =>
  uploads.some((u) => u.path.includes("/"))
    ? FROM_FOLDERS
    : (classes[0] ?? NEW_CLASS);

/**
 * Add your own images from files or folders. A folder's subfolders become classes,
 * loose files go into the class picked here. Mount it only while open, so each
 * opening starts from the files passed in
 */
export function AddImagesDialog({
  classes,
  initial,
  onClose,
  onStart,
}: {
  classes: string[];
  // files dropped on the page before the dialog opened
  initial: Upload[];
  onClose: () => void;
  onStart: (uploads: Upload[], target: string | null) => void;
}) {
  const [uploads, setUploads] = useState(initial);
  const [target, setTarget] = useState(() => defaultTarget(initial, classes));
  const [newClass, setNewClass] = useState("");
  const [over, setOver] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);

  const images = useMemo(
    () => uploads.filter((u) => isImage(u.path)),
    [uploads],
  );
  const inFolders = images.filter((u) => u.path.includes("/")).length;

  const choose = (next: Upload[]) => {
    setUploads(next);
    setTarget(defaultTarget(next, classes));
  };

  // React has no prop for the directory picker attribute
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  const resolved =
    target === FROM_FOLDERS
      ? null
      : target === NEW_CLASS
        ? slugify(newClass)
        : target;
  const ready =
    images.length > 0 &&
    (target === FROM_FOLDERS ||
      (target === NEW_CLASS ? !!newClass.trim() : !!target));

  return (
    <Modal open onClose={onClose}>
      <h2 className="text-lg font-semibold">Add images</h2>
      <p className="text-muted mt-1 text-sm">
        Add your own photos. Pick a folder whose subfolders are classes, or
        files to put in one class.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          collectDropped(e.dataTransfer).then(choose);
        }}
        className={`mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center ${
          over ? "border-primary bg-primary-soft" : "border-border"
        }`}
      >
        <p className="text-muted">Drop images or folders here</p>
        <div className="flex gap-2">
          <label className={`${btn} cursor-pointer`}>
            Choose files
            <input
              type="file"
              multiple
              accept={[...IMAGE_EXTS].join(",")}
              className="sr-only"
              onChange={(e) =>
                e.target.files && choose(collectPicked(e.target.files))
              }
            />
          </label>
          <label className={`${btn} cursor-pointer`}>
            Choose folder
            <input
              ref={folderInput}
              type="file"
              className="sr-only"
              onChange={(e) =>
                e.target.files && choose(collectPicked(e.target.files))
              }
            />
          </label>
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            {images.length} image{images.length === 1 ? "" : "s"} selected
            {uploads.length > images.length &&
              `, ${uploads.length - images.length} other files skipped`}
          </p>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Put them in</span>
            <select
              className={field}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {inFolders > 0 && (
                <option value={FROM_FOLDERS}>
                  The class named by each folder
                </option>
              )}
              {classes.map((c) => (
                <option key={c} value={c}>
                  {prettyClass(c)}
                </option>
              ))}
              <option value={NEW_CLASS}>New class…</option>
            </select>
            {target === NEW_CLASS && (
              <input
                autoFocus
                className={`${field} min-w-0 flex-1`}
                placeholder="Class name"
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                aria-label="New class name"
              />
            )}
          </label>
          {target === FROM_FOLDERS && inFolders < images.length && (
            <p className="text-warn text-sm">
              {images.length - inFolders} loose file
              {images.length - inFolders === 1 ? " isn't" : "s aren't"} in a
              folder and will be skipped.
            </p>
          )}
        </div>
      )}

      <ModalActions
        actionLabel="Add images"
        disabled={!ready}
        onCancel={onClose}
        onAction={() => onStart(images, resolved)}
      />
    </Modal>
  );
}
