import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { prettyClass } from "../classname";
import { api, ApiError } from "../api";
import { useDataset } from "../stores/dataset";
import type { Item, Status } from "../types";
import { statusLabel } from "../status";
import { humanBytes } from "../format";
import { getHotkeys } from "../settings";
import { BackIcon, CloseIcon, CopyIcon, CropIcon, TrashIcon } from "./icons";

type FileDetails = {
  width: number | null;
  height: number | null;
  bytes: number | null;
  ingested: number | null;
};

// the drag selection over the image, in displayed pixels
type CropRect = { x: number; y: number; w: number; h: number };

const STATUSES: Status[] = ["pending", "valid"];

// active-state colors per status, so Valid reads green like the chip and grid badges do
const ACTIVE_STATUS: Record<Status, string> = {
  valid: "bg-good text-white",
  pending: "bg-primary text-white",
  invalid: "bg-bad text-white",
};

export function AnnotateDialog({
  item,
  datasetName,
  classes,
  onClose,
  onDelete,
  onDuplicate,
  onPrev,
  onNext,
}: {
  item: Item | null;
  datasetName: string;
  classes: string[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  // move to the adjacent image in the grid order, absent at either end
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const replaceItem = useDataset((s) => s.replaceItem);
  const [current, setCurrent] = useState<Item | null>(item);
  const [dims, setDims] = useState<FileDetails | null>(null);

  const [cropping, setCropping] = useState(false);
  const [sel, setSel] = useState<CropRect | null>(null);
  // cursor position over the image while cropping, drives the crosshair guides
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const [cropError, setCropError] = useState("");
  // bumped after each crop so the img src changes and the browser refetches the file
  const [imgVersion, setImgVersion] = useState(0);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setCurrent(item);
    setCropping(false);
    setSel(null);
    setCropError("");
    if (item) {
      setDims(null);
      api
        .getItem(datasetName, item.id)
        .then((d) =>
          setDims({
            width: d.width,
            height: d.height,
            bytes: d.bytes,
            ingested: d.ingested,
          }),
        )
        .catch(() => {});
    }
  }, [item, datasetName]);

  // latest handlers for the window-level key listener, which is bound once per open
  const keyActions = useRef<{
    prev?: () => void;
    next?: () => void;
    mark?: (s: Status) => void;
  }>({});

  const open = current !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)
        return;
      if (e.key === "ArrowLeft") {
        keyActions.current.prev?.();
        return;
      }
      if (e.key === "ArrowRight") {
        keyActions.current.next?.();
        return;
      }
      const hotkeys = getHotkeys();
      if (e.key === hotkeys.valid) keyActions.current.mark?.("valid");
      else if (e.key === hotkeys.unreviewed)
        keyActions.current.mark?.("pending");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!current) return null;

  const imgSrc = imgVersion ? `${current.url}?v=${imgVersion}` : current.url;

  // update both the store (so the grid reflects the change) and the modal's own copy
  const applied = (updated: Item) => {
    setCurrent(updated);
    replaceItem(updated);
  };

  const setSubject = async (next: string) => {
    if (!next || next === current.label) return;
    applied((await api.setLabel(datasetName, current.id, next)).item);
  };

  const setStatus = async (status: Status) => {
    applied((await api.setStatus(datasetName, current.id, status)).item);
  };

  keyActions.current = { prev: onPrev, next: onNext, mark: setStatus };

  const clampPoint = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = clampPoint(e);
    dragStart.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = clampPoint(e);
    setCursor(p);
    const s = dragStart.current;
    if (!s) return;
    setSel({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  };

  const endDrag = () => {
    dragStart.current = null;
  };

  const exitCrop = () => {
    setCropping(false);
    setSel(null);
    setCursor(null);
    setCropError("");
  };

  const applyCrop = async () => {
    const img = imgRef.current;
    if (!img || !sel || cropBusy) return;
    // the drag rect is in displayed pixels, the backend takes original-image pixels
    const scale = img.naturalWidth / img.clientWidth;
    const left = Math.max(0, Math.round(sel.x * scale));
    const top = Math.max(0, Math.round(sel.y * scale));
    const width = Math.min(
      img.naturalWidth - left,
      Math.max(1, Math.round(sel.w * scale)),
    );
    const height = Math.min(
      img.naturalHeight - top,
      Math.max(1, Math.round(sel.h * scale)),
    );
    setCropBusy(true);
    setCropError("");
    try {
      const { item: updated } = await api.cropItem(datasetName, current.id, {
        left,
        top,
        width,
        height,
      });
      const version = Date.now();
      setImgVersion(version);
      setCurrent(updated);
      // bust the grid's copy too, the plain URL is still cached
      replaceItem({ ...updated, url: `${updated.url}?v=${version}` });
      setDims({
        width: updated.width,
        height: updated.height,
        bytes: updated.bytes,
        ingested: updated.ingested,
      });
      exitCrop();
    } catch (e) {
      setCropError(
        e instanceof ApiError ? e.message : "Could not crop the image",
      );
    } finally {
      setCropBusy(false);
    }
  };

  // the current class may be one the dataset no longer declares, so include it as an option
  const classOptions = (
    classes.includes(current.label) ? classes : [current.label, ...classes]
  ).map((c) => ({ value: c, label: prettyClass(c) }));

  return (
    <Modal open onClose={onClose} width="max-w-xl">
      {onPrev && (
        <button
          onClick={onPrev}
          className="bg-card border-border text-muted hover:text-primary absolute top-1/2 -left-16 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border shadow-lg"
          title="Previous image"
          aria-label="Previous image"
        >
          <BackIcon className="h-5 w-5" />
        </button>
      )}
      {onNext && (
        <button
          onClick={onNext}
          className="bg-card border-border text-muted hover:text-primary absolute top-1/2 -right-16 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border shadow-lg"
          title="Next image"
          aria-label="Next image"
        >
          <BackIcon className="h-5 w-5 rotate-180" />
        </button>
      )}
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 truncate text-lg font-semibold">
            {prettyClass(current.label)}
          </h2>
          <button
            onClick={() => {
              if (cropping) {
                exitCrop();
                return;
              }
              // reload the image on entry, so the crop is measured against the file
              // as it is now rather than a stale cached render
              setImgVersion(Date.now());
              setCropping(true);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              cropping
                ? "bg-primary text-white"
                : "border-border text-muted hover:text-primary border"
            }`}
            title="Crop image"
            aria-label="Crop image"
          >
            <CropIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDuplicate(current.id)}
            className="border-border text-muted hover:text-primary flex h-8 w-8 items-center justify-center rounded-full border"
            title="Duplicate image (new copy with its own id)"
            aria-label="Duplicate image"
          >
            <CopyIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(current.id)}
            className="bg-bad/90 flex h-8 w-8 items-center justify-center rounded-full text-white hover:brightness-95"
            title="Delete to bin"
            aria-label="Delete to bin"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="border-border text-muted hover:bg-bg flex h-8 w-8 items-center justify-center rounded-full border"
            title="Close"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {cropping ? (
          <div className="bg-bg flex justify-center rounded-lg">
            <div
              className="relative cursor-crosshair touch-none select-none"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerLeave={() => setCursor(null)}
            >
              <img
                ref={imgRef}
                src={imgSrc}
                alt={prettyClass(current.label)}
                draggable={false}
                className="block max-h-[60vh] max-w-full"
              />
              {cursor && (
                <>
                  <div
                    className="bg-primary/60 pointer-events-none absolute right-0 left-0"
                    style={{ top: cursor.y, height: 1 }}
                  />
                  <div
                    className="bg-primary/60 pointer-events-none absolute top-0 bottom-0"
                    style={{ left: cursor.x, width: 1 }}
                  />
                </>
              )}
              {sel && sel.w > 0 && sel.h > 0 && (
                <div
                  className="border-primary bg-primary/20 pointer-events-none absolute border-2"
                  style={{
                    left: sel.x,
                    top: sel.y,
                    width: sel.w,
                    height: sel.h,
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <img
            src={imgSrc}
            alt={prettyClass(current.label)}
            className="bg-bg max-h-[60vh] w-full rounded-lg object-contain"
          />
        )}

        {cropping && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted flex-1 text-sm">
              Drag on the image to choose the area to keep.
            </p>
            <button
              onClick={exitCrop}
              className="text-muted hover:text-text px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={applyCrop}
              disabled={cropBusy || !sel || sel.w < 2 || sel.h < 2}
              className="bg-primary rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {cropBusy ? "Cropping" : "Apply crop"}
            </button>
            {cropError && (
              <p className="text-bad w-full text-sm">{cropError}</p>
            )}
          </div>
        )}

        <hr className="border-border" />

        <ItemDetail item={current} dims={dims} />

        <hr className="border-border" />

        <div className="flex flex-wrap items-end gap-4 pb-1">
          <div className="min-w-40 flex-1">
            <label className="text-sm font-medium">Class</label>
            <Select
              className="mt-1"
              value={current.label}
              placeholder="Choose class"
              options={classOptions}
              onChange={setSubject}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <div className="mt-1 flex gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    current.status === s
                      ? ACTIVE_STATUS[s]
                      : "border-border text-muted hover:bg-bg border"
                  }`}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ItemDetail({ item, dims }: { item: Item; dims: FileDetails | null }) {
  return (
    <dl className="space-y-1 text-xs">
      <Row label="Source" value={item.source} />
      {item.source_url && (
        <div className="flex justify-between gap-2">
          <dt className="text-muted shrink-0">Source URL</dt>
          <a
            href={item.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-primary min-w-0 truncate hover:underline"
            title={item.source_url}
          >
            {item.source_url}
          </a>
        </div>
      )}
      {item.title && <Row label="Title" value={item.title} />}
      {item.predicted && (
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Model classification</dt>
          <dd className={item.predicted === item.label ? "" : "text-bad"}>
            {prettyClass(item.predicted)}
          </dd>
        </div>
      )}
      <Row label="Folder" value={item.directory} />
      <Row label="File" value={item.filename} />
      {dims && dims.width && (
        <Row label="Size" value={`${dims.width}×${dims.height}`} />
      )}
      {dims && dims.bytes != null && (
        <Row label="On disk" value={humanBytes(dims.bytes)} />
      )}
      {dims && dims.ingested != null && (
        <Row
          label="Ingested"
          value={new Date(dims.ingested * 1000).toLocaleString()}
        />
      )}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}
