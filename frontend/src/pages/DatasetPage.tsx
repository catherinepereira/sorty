import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type ModelReport } from "../api";
import { useDataset } from "../stores/dataset";
import { useJob } from "../hooks/useJob";
import { useConfirm } from "../hooks/useConfirm";
import { Header } from "../components/Header";
import { ImageCard } from "../components/ImageCard";
import { AnnotateDialog } from "../components/AnnotateDialog";
import { GenerateDialog } from "../components/GenerateDialog";
import { TrainDialog } from "../components/TrainDialog";
import { ExportDatasetDialog } from "../components/ExportDatasetDialog";
import { CreateSplitsDialog } from "../components/CreateSplitsDialog";
import { SummaryPanel } from "../components/SummaryPanel";
import { DatasetToolsPanel } from "../components/DatasetToolsPanel";
import { TrainingPanel } from "../components/TrainingPanel";
import { Expandable } from "../components/Expandable";
import { JobProgress } from "../components/JobProgress";
import { FilterSidebar, type Filters } from "../components/FilterSidebar";
import { Select } from "../components/Select";
import {
  CloseIcon,
  PencilIcon,
  RefreshIcon,
  TrashIcon,
} from "../components/icons";
import type { Item, JobState, Status } from "../types";
import { statusLabel } from "../status";
import { prettyClass } from "../classname";
import { clearActiveJob, getActiveJob, setActiveJob } from "../activeJobs";

type DialogName =
  "generate" | "crossval" | "train" | "createSplits" | "exportData" | null;

// banner colors: green for a completed sync, red for an error, amber for filter/info
const BANNER_TONE = {
  success: "border-good/30 bg-good/10 text-good",
  error: "border-bad/30 bg-bad/10 text-bad",
  info: "border-warn/30 bg-warn/10 text-warn",
} as const;

export function DatasetPage() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const {
    detail,
    loading,
    selected,
    selectMode,
    load,
    refresh,
    toggle,
    setSelected,
    clearSelection,
    setSelectMode,
  } = useDataset();
  const { ask, element: confirmEl } = useConfirm();

  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [banner, setBanner] = useState<{
    text: string;
    tone: "info" | "success" | "error";
  } | null>(null);
  const notify = (text: string, tone: "info" | "success" | "error" = "info") =>
    setBanner({ text, tone });
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [query, setQuery] = useState("");
  const [flaggedIds, setFlaggedIds] = useState<string[] | null>(null);
  // set for exact dedup: each inner list is one duplicate set, rendered on its own row
  const [dupeGroups, setDupeGroups] = useState<string[][] | null>(null);
  const [filters, setFilters] = useState<Filters>({
    classes: new Set(),
    sources: new Set(),
    statuses: new Set(),
    classification: new Set(),
    splits: new Set(),
  });

  const items = useMemo(() => detail?.items ?? [], [detail]);

  // only sources that appear on items, so the filter never offers an empty bucket
  const sourceOptions = useMemo(
    () => [...new Set(items.map((i) => i.source))].sort(),
    [items],
  );

  // per-class counts under the active status filter, so checking Unreviewed shows how
  // many of each class are left to review
  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) {
      if (filters.statuses.size && !filters.statuses.has(i.status)) continue;
      counts[i.label] = (counts[i.label] ?? 0) + 1;
    }
    return counts;
  }, [items, filters.statuses]);

  const hasPredictions = useMemo(
    () => items.some((i) => i.predicted !== null),
    [items],
  );

  // split filter options and counts, hidden entirely while no item sits in a split
  const splitCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) {
      const key = i.split ?? "none";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [items]);
  const splitOptions = useMemo(() => {
    const present = Object.keys(splitCounts);
    if (!present.some((k) => k !== "none")) return [];
    const order = ["train", "test", "valid", "none"];
    return order.filter((k) => present.includes(k));
  }, [splitCounts]);

  const visible = useMemo(() => {
    const flagged = flaggedIds ? new Set(flaggedIds) : null;
    const q = query.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (flagged && !flagged.has(i.id)) return false;
      if (q) {
        const hay =
          `${i.title} ${i.source_url} ${i.label} ${prettyClass(i.label)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.classes.size && !filters.classes.has(i.label)) return false;
      if (filters.sources.size && !filters.sources.has(i.source)) return false;
      if (filters.statuses.size && !filters.statuses.has(i.status))
        return false;
      if (filters.classification.size) {
        // images without a prediction match neither bucket, so any classification filter hides them
        if (!i.predicted) return false;
        const bucket = i.predicted === i.label ? "correct" : "mismatch";
        if (!filters.classification.has(bucket)) return false;
      }
      if (filters.splits.size && !filters.splits.has(i.split ?? "none"))
        return false;
      return true;
    });
    if (!flaggedIds) return filtered;
    // show flagged images in the order the scan returned them, so duplicate groups stay
    // adjacent instead of scattered by manifest order
    const rank = new Map(flaggedIds.map((id, n) => [id, n]));
    return [...filtered].sort(
      (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    );
  }, [items, filters, flaggedIds, query]);

  // the saved model's training report and run history, shown in Training Tools
  const [modelReport, setModelReport] = useState<ModelReport | null>(null);
  const [modelRuns, setModelRuns] = useState<ModelReport[]>([]);
  const loadModelInfo = useCallback(() => {
    api
      .modelInfo(name)
      .then((info) => {
        setModelReport(info.trained ? info.report : null);
        setModelRuns(info.runs);
      })
      .catch(() => {});
  }, [name]);

  // set while a flag-and-filter dedup job runs, so onJobDone can read its result
  const dedupRunning = useRef(false);

  const onJobDone = (job: JobState) => {
    const wasDedup = dedupRunning.current;
    dedupRunning.current = false;
    if (wasDedup && job.status === "done") {
      const result = job.result as { flagged: string[]; groups: string[][] };
      const ids = result.flagged;
      if (!ids.length) {
        // nothing flagged, leave the grid unfiltered
        notify("No duplicates found.");
        return;
      }
      setFlaggedIds(ids);
      setDupeGroups(result.groups);
      notify(
        `Filtered to ${ids.length} possible duplicate${ids.length === 1 ? "" : "s"}. Review and delete, or clear the filter.`,
      );
      return;
    }
    clearActiveJob(name);
    refresh();
    if (job.status !== "done") {
      if (job.status === "error") notify(job.error, "error");
      return;
    }
    const result = job.result as {
      predicted?: number;
      mismatched?: number;
      overall_accuracy?: number;
    } | null;
    if (result && result.mismatched !== undefined) {
      notify(
        `Cross-validation predicted ${result.predicted} images, ${result.mismatched} disagree with their label. Filter by cross-validation to review them.`,
        "success",
      );
    } else if (result && result.overall_accuracy !== undefined) {
      loadModelInfo();
      notify(
        `Model trained, ${Math.round(result.overall_accuracy * 100)}% validation accuracy. The full report is in Training Tools.`,
        "success",
      );
    }
  };
  const { job, start, running, clear } = useJob(onJobDone);

  useEffect(() => {
    load(name);
    loadModelInfo();
    // reattach to a generate/train job left running when the page was last open,
    // dropping the stored id if that job no longer exists on the server
    const active = getActiveJob(name);
    if (active) {
      api
        .job(active)
        .then(() => start(active))
        .catch(() => clearActiveJob(name));
    }
  }, [name, load, start, loadModelInfo]);

  const runJob = async (fn: () => Promise<{ job_id: string }>) => {
    setBanner(null);
    setDialog(null);
    clear();
    try {
      const { job_id } = await fn();
      setActiveJob(name, job_id);
      start(job_id);
    } catch (e) {
      notify(
        e instanceof ApiError ? e.message : "Could not start the job",
        "error",
      );
    }
  };

  const runDedup = async () => {
    setBanner(null);
    setFlaggedIds(null);
    setDupeGroups(null);
    clear();
    dedupRunning.current = true;
    try {
      const { job_id } = await api.dedup(name);
      start(job_id);
    } catch (e) {
      dedupRunning.current = false;
      notify(
        e instanceof ApiError ? e.message : "Could not run the scan",
        "error",
      );
    }
  };

  const clearFlagged = () => {
    setFlaggedIds(null);
    setDupeGroups(null);
    setBanner(null);
  };

  const rename = async (newName: string) => {
    setEditingName(false);
    const next = newName.trim();
    if (!next || next === name) return;
    try {
      const { name: slug } = await api.renameDataset(name, next);
      nav(`/d/${slug}`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Could not rename", "error");
    }
  };

  const refreshFromDisk = async () => {
    setBanner(null);
    try {
      const { added, pruned } = await api.refresh(name);
      notify(`Synced with disk: ${added} added, ${pruned} pruned`, "success");
      refresh();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Could not refresh", "error");
    }
  };

  const selectVisible = () => visible.forEach((i) => setSelected(i.id, true));

  const deleteSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await ask({
      title: "Delete to bin",
      message: `Move ${ids.length} image${ids.length > 1 ? "s" : ""} to the recycle bin?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await api.del(name, ids);
    clearSelection();
    refresh();
  };

  const deleteOne = useCallback(
    async (id: string) => {
      await api.del(name, [id]);
      setOpenItem(null);
      refresh();
    },
    [name, refresh],
  );

  // duplicate from the popup, then open the copy so it can be cropped right away
  const duplicateOne = useCallback(
    async (id: string) => {
      const { item } = await api.duplicateItem(name, id);
      // slot the copy into the navigation order next to its original
      const seq = panelSeq.current;
      const at = seq.indexOf(id);
      if (at >= 0) seq.splice(at + 1, 0, item.id);
      else seq.push(item.id);
      setOpenItem(item);
      refresh();
    },
    [name, refresh],
  );

  const moveSelectedTo = async (subject: string) => {
    const ids = [...selected];
    if (!ids.length || !subject) return;
    await api.moveToClass(name, ids, subject);
    clearSelection();
    refresh();
  };

  const moveSelectedToSplit = async (split: string) => {
    const ids = [...selected];
    if (!ids.length || !split) return;
    try {
      await api.moveSplit(name, ids, split);
      clearSelection();
      refresh();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Could not move", "error");
    }
  };

  const markSelected = async (status: Status) => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      await api.setStatusMany(name, ids, status);
      clearSelection();
      refresh();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Could not mark", "error");
    }
  };

  const runCreateSplits = async (body: {
    test_percent: number;
    valid_percent: number;
    seed: number;
  }) => {
    setDialog(null);
    try {
      const counts = await api.createSplits(name, body);
      const valid = counts.valid ? `, ${counts.valid} valid` : "";
      notify(
        `Splits created: ${counts.train} train, ${counts.test} test${valid}.`,
        "success",
      );
      refresh();
    } catch (e) {
      notify(
        e instanceof ApiError ? e.message : "Could not create splits",
        "error",
      );
    }
  };

  const toggleLock = async (which: "splits" | "review") => {
    const locks = detail?.locks ?? { splits: false, review: false };
    await api.setLocks(name, { [which]: !locks[which] });
    refresh();
  };

  // toggling an item's checkbox enters select mode, so the user can then click other
  // images to keep selecting without first hitting the Select button
  const toggleItem = (id: string) => {
    if (!selectMode && !selected.has(id)) setSelectMode(true);
    toggle(id);
  };

  // the popup's navigation order, frozen when it opens. An edit that drops the image
  // out of the current filters (e.g. marking it valid under an Unreviewed filter) then
  // keeps the arrows, so a review pass can keep stepping through the sequence
  const panelSeq = useRef<string[]>([]);
  const openPanel = useCallback(
    (item: Item) => {
      panelSeq.current = visible.map((i) => i.id);
      setOpenItem(item);
    },
    [visible],
  );

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );
  const openIndex = openItem ? panelSeq.current.indexOf(openItem.id) : -1;
  const openAdjacent = (delta: number) => {
    const seq = panelSeq.current;
    let idx = openIndex + delta;
    // skip entries binned or deleted since the sequence was captured
    while (idx >= 0 && idx < seq.length && !itemsById.has(seq[idx]))
      idx += delta;
    const next =
      idx >= 0 && idx < seq.length ? itemsById.get(seq[idx]) : undefined;
    if (next) setOpenItem(next);
  };

  if (loading || !detail)
    return <Header subtitle="Loading" mood="working" backTo="/" />;

  const s = detail.stats;

  return (
    <>
      <Header
        title={
          <span className="flex items-baseline gap-2">
            <span>Dataset:</span>
            {editingName ? (
              <input
                autoFocus
                className="border-primary w-64 border-b bg-transparent text-2xl font-bold outline-none"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename(nameDraft);
                  if (e.key === "Escape") setEditingName(false);
                }}
                onBlur={() => rename(nameDraft)}
                aria-label="Dataset name"
              />
            ) : (
              <span>{name}</span>
            )}
          </span>
        }
        titleAction={
          !editingName && (
            <button
              onClick={() => {
                setNameDraft(name);
                setEditingName(true);
              }}
              className="text-muted hover:text-primary p-1"
              title="Rename dataset"
              aria-label="Rename dataset"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
          )
        }
        subtitle={`${s.total} images, ${s.pending} unreviewed, ${s.valid} reviewed`}
        backTo="/"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={refreshFromDisk}
              className="border-good/30 bg-good/10 text-good hover:bg-good/20 flex h-10 w-10 items-center justify-center rounded-lg border"
              title="Sync with disk"
              aria-label="Sync with disk"
            >
              <RefreshIcon className="h-5 w-5" />
            </button>
            <Link
              to={`/d/${name}/bin`}
              className="border-bad/30 bg-bad/10 text-bad hover:bg-bad/20 flex h-10 w-10 items-center justify-center rounded-lg border"
              title="Recycle bin"
              aria-label="Recycle bin"
            >
              <TrashIcon className="h-5 w-5" />
            </Link>
          </div>
        }
      />

      <Expandable title="Summary">
        <SummaryPanel
          datasetName={name}
          onChanged={refresh}
          reloadToken={detail}
        />
      </Expandable>

      <Expandable title="Dataset Tools" defaultOpen>
        <DatasetToolsPanel
          busy={Boolean(job && running)}
          locks={detail.locks}
          onGenerate={() => setDialog("generate")}
          onDuplicates={runDedup}
          onCrossval={() => setDialog("crossval")}
          onCreateSplits={() => setDialog("createSplits")}
          onExportDataset={() => setDialog("exportData")}
          onToggleLock={toggleLock}
        />
      </Expandable>

      <Expandable title="Training Tools">
        <TrainingPanel
          busy={Boolean(job && running)}
          report={modelReport}
          runs={modelRuns}
          onTrain={() => setDialog("train")}
          exportUrl={`/api/datasets/${name}/model/export`}
        />
      </Expandable>

      <hr className="border-border my-6" />

      {banner && (
        <div
          className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-2 text-sm ${BANNER_TONE[banner.tone]}`}
        >
          <span>{banner.text}</span>
          {flaggedIds && (
            <button
              className="ml-auto underline hover:opacity-80"
              onClick={clearFlagged}
            >
              Clear filter
            </button>
          )}
          <button
            className={`${flaggedIds ? "" : "ml-auto"} hover:opacity-80`}
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {job && running && (
        <div className="mb-4">
          <JobProgress job={job} />
        </div>
      )}

      {detail.items.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <input
            type="search"
            className="border-border focus:border-primary bg-card max-w-4xl flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            placeholder="Search title, source URL, or class"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={() => setSelectMode(!selectMode)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              selectMode ? "bg-primary text-white" : "bg-card shadow-sm"
            }`}
          >
            {selectMode ? "Deselect" : "Select"}
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="border-primary bg-primary-soft sticky top-2 z-10 mb-4 flex items-center gap-3 rounded-xl border px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            className="text-muted hover:text-text text-sm"
            onClick={selectVisible}
          >
            Select all
          </button>
          <button
            className="text-muted hover:text-text text-sm"
            onClick={clearSelection}
          >
            Clear
          </button>
          <div
            className={`ml-auto ${detail.locks.review ? "pointer-events-none opacity-40" : ""}`}
            title={
              detail.locks.review
                ? "Reviewing is locked for this dataset"
                : undefined
            }
          >
            <Select
              className="w-32"
              value=""
              placeholder="Mark as"
              options={[
                { value: "valid", label: statusLabel("valid") },
                { value: "pending", label: statusLabel("pending") },
              ]}
              onChange={(v) => markSelected(v as Status)}
            />
          </div>
          <Select
            className="w-40"
            value=""
            placeholder="Move to class"
            options={detail.subjects.map((c) => ({
              value: c,
              label: prettyClass(c),
            }))}
            onChange={(v) => moveSelectedTo(v)}
          />
          <div
            className={
              detail.locks.splits ? "pointer-events-none opacity-40" : ""
            }
            title={
              detail.locks.splits
                ? "Splits are locked for this dataset"
                : undefined
            }
          >
            <Select
              className="w-36"
              value=""
              placeholder="Move to split"
              options={[
                { value: "train", label: "Train" },
                { value: "test", label: "Test" },
                { value: "valid", label: "Valid" },
                { value: "none", label: "No split" },
              ]}
              onChange={(v) => moveSelectedToSplit(v)}
            />
          </div>
          <button
            className="bg-bad rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            onClick={deleteSelected}
          >
            Delete to bin
          </button>
        </div>
      )}

      {detail.items.length === 0 ? (
        <p className="text-muted mt-16 text-center">
          No images yet. Add classes, then generate images.
        </p>
      ) : (
        <div className="flex gap-5">
          <FilterSidebar
            classes={detail.subjects}
            classCounts={classCounts}
            sources={sourceOptions}
            splits={splitOptions}
            splitCounts={splitCounts}
            hasPredictions={hasPredictions}
            filters={filters}
            setFilters={setFilters}
            shown={visible.length}
            total={items.length}
          />
          <div className="min-w-0 flex-1">
            {visible.length === 0 ? (
              <p className="text-muted mt-16 text-center">
                No images match the current filters.
              </p>
            ) : dupeGroups ? (
              <DuplicateGroups
                groups={dupeGroups}
                items={visible}
                selected={selected}
                selectMode={selectMode}
                onToggle={toggleItem}
                onSetSelected={setSelected}
                onOpen={openPanel}
                onDelete={deleteOne}
              />
            ) : (
              <ImageGrid
                items={visible}
                selected={selected}
                selectMode={selectMode}
                onToggle={toggleItem}
                onSetSelected={setSelected}
                onOpen={openPanel}
                onDelete={deleteOne}
              />
            )}
          </div>
        </div>
      )}

      <AnnotateDialog
        item={openItem}
        datasetName={name}
        classes={detail.subjects}
        reviewLocked={detail.locks.review}
        onClose={() => setOpenItem(null)}
        onDelete={deleteOne}
        onDuplicate={duplicateOne}
        onPrev={openIndex > 0 ? () => openAdjacent(-1) : undefined}
        onNext={
          openIndex >= 0 && openIndex < panelSeq.current.length - 1
            ? () => openAdjacent(1)
            : undefined
        }
      />
      <GenerateDialog
        open={dialog === "generate"}
        classes={detail.subjects}
        onClose={() => setDialog(null)}
        onStart={(body) => runJob(() => api.generate(name, body))}
      />
      <TrainDialog
        open={dialog === "train" || dialog === "crossval"}
        mode={dialog === "crossval" ? "crossval" : "train"}
        items={items}
        onClose={() => setDialog(null)}
        onStart={(body) =>
          runJob(() =>
            dialog === "crossval"
              ? api.crossval(name, body)
              : api.train(name, {
                  model: body.model,
                  epochs: body.epochs,
                  valid_only: body.valid_only,
                }),
          )
        }
      />
      <CreateSplitsDialog
        open={dialog === "createSplits"}
        onClose={() => setDialog(null)}
        onStart={runCreateSplits}
      />
      <ExportDatasetDialog
        open={dialog === "exportData"}
        datasetName={name}
        counts={s}
        onClose={() => setDialog(null)}
      />
      {confirmEl}
    </>
  );
}

type GridProps = {
  selected: Set<string>;
  selectMode: boolean;
  onToggle: (id: string) => void;
  onSetSelected: (id: string, on: boolean) => void;
  onOpen: (item: Item) => void;
  onDelete: (id: string) => void;
};

// one duplicate set per row: each group is its own grid so a new group always starts on
// a fresh line instead of flowing into the previous group's trailing cells
function DuplicateGroups({
  groups,
  items,
  ...grid
}: GridProps & { groups: string[][]; items: Item[] }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = groups
    .map((ids) => ids.map((id) => byId.get(id)).filter((i): i is Item => !!i))
    .filter((row) => row.length > 0);

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row[0].id} className="border-border rounded-xl border p-2">
          <ImageGrid items={row} {...grid} />
        </div>
      ))}
    </div>
  );
}

function ImageGrid({
  items,
  selected,
  selectMode,
  onToggle,
  onSetSelected,
  onOpen,
  onDelete,
}: GridProps & { items: Item[] }) {
  // drag across cards to paint selection, only in select mode
  const dragging = useRef(false);
  const dragValue = useRef(true);

  const endDrag = () => (dragging.current = false);
  useEffect(() => {
    window.addEventListener("mouseup", endDrag);
    return () => window.removeEventListener("mouseup", endDrag);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.id}
          onMouseDown={() => {
            if (!selectMode) return;
            dragging.current = true;
            dragValue.current = !selected.has(item.id);
            onSetSelected(item.id, dragValue.current);
          }}
          onMouseEnter={() => {
            if (selectMode && dragging.current)
              onSetSelected(item.id, dragValue.current);
          }}
        >
          <ImageCard
            item={item}
            selected={selected.has(item.id)}
            selectMode={selectMode}
            onToggle={() => onToggle(item.id)}
            onOpen={() => onOpen(item)}
            onDelete={() => onDelete(item.id)}
          />
        </div>
      ))}
    </div>
  );
}
