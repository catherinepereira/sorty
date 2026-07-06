import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useDataset } from "../stores/dataset";
import { useJob } from "../hooks/useJob";
import { useConfirm } from "../hooks/useConfirm";
import { Header } from "../components/Header";
import { ImageCard } from "../components/ImageCard";
import { AnnotateDialog } from "../components/AnnotateDialog";
import { GenerateDialog } from "../components/GenerateDialog";
import { RenameDialog } from "../components/RenameDialog";
import { SummaryPanel } from "../components/SummaryPanel";
import { MLToolsPanel } from "../components/MLToolsPanel";
import { Expandable } from "../components/Expandable";
import { JobProgress } from "../components/JobProgress";
import { MismatchPanel } from "../components/MismatchPanel";
import { FilterSidebar, type Filters } from "../components/FilterSidebar";
import { Select } from "../components/Select";
import { CloseIcon, PencilIcon, RefreshIcon, TrashIcon } from "../components/icons";
import type { Item, JobState, Prediction, Status } from "../types";
import { statusLabel } from "../status";
import { prettyClass } from "../classname";
import { clearActiveJob, getActiveJob, setActiveJob } from "../activeJobs";

type DialogName = "generate" | "rename" | null;

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
  const [mismatches, setMismatches] = useState<Prediction[] | null>(null);
  const [banner, setBanner] = useState<{
    text: string;
    tone: "info" | "success" | "error";
  } | null>(null);
  const notify = (text: string, tone: "info" | "success" | "error" = "info") =>
    setBanner({ text, tone });
  const [renameError, setRenameError] = useState("");
  const [flaggedIds, setFlaggedIds] = useState<string[] | null>(null);
  // set for exact dedup: each inner list is one duplicate set, rendered on its own row
  const [dupeGroups, setDupeGroups] = useState<string[][] | null>(null);
  const [filters, setFilters] = useState<Filters>({
    classes: new Set(),
    sources: new Set(),
    statuses: new Set(),
  });

  const items = useMemo(() => detail?.items ?? [], [detail]);

  // declared sources plus any seen on items (e.g. "unknown"), so every source that can
  // appear in the grid is offered as a filter option
  const sourceOptions = useMemo(() => {
    const seen = new Set(detail?.sources ?? []);
    for (const i of items) seen.add(i.source);
    return [...seen].sort();
  }, [detail, items]);

  const visible = useMemo(() => {
    const flagged = flaggedIds ? new Set(flaggedIds) : null;
    const filtered = items.filter((i) => {
      if (flagged && !flagged.has(i.id)) return false;
      if (filters.classes.size && !filters.classes.has(i.label)) return false;
      if (filters.sources.size && !filters.sources.has(i.source)) return false;
      if (filters.statuses.size && !filters.statuses.has(i.status)) return false;
      return true;
    });
    if (!flaggedIds) return filtered;
    // show flagged images in the order the scan returned them, so duplicate groups stay
    // adjacent instead of scattered by manifest order
    const rank = new Map(flaggedIds.map((id, n) => [id, n]));
    return [...filtered].sort(
      (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    );
  }, [items, filters, flaggedIds]);

  // set while a flag-and-filter dedup job runs, so onJobDone can read its result
  const dedupMode = useRef<"exact" | "outliers" | null>(null);

  const onJobDone = (job: JobState) => {
    const mode = dedupMode.current;
    dedupMode.current = null;
    if (mode && job.status === "done") {
      const result = job.result as { flagged: string[]; groups?: string[][] };
      const ids = result.flagged;
      const label = mode === "exact" ? "duplicate" : "outlier";
      setFlaggedIds(ids);
      setDupeGroups(result.groups ?? null);
      notify(
        ids.length
          ? `Filtered to ${ids.length} possible ${label}${ids.length === 1 ? "" : "s"}. Review and delete, or clear the filter.`
          : `No ${label}s found.`,
      );
      return;
    }
    clearActiveJob(name);
    refresh();
    if (job.status === "error") notify(job.error, "error");
  };
  const { job, start, running, clear } = useJob(onJobDone);

  const inferJob = useJob((state) => {
    if (state.status === "done") setMismatches(state.result as Prediction[]);
    else if (state.status === "error") notify(state.error, "error");
  });

  useEffect(() => {
    load(name);
    // reattach to a generate/train job left running when the page was last open,
    // dropping the stored id if that job no longer exists on the server
    const active = getActiveJob(name);
    if (active) {
      api
        .job(active)
        .then(() => start(active))
        .catch(() => clearActiveJob(name));
    }
  }, [name, load, start]);

  const runJob = async (fn: () => Promise<{ job_id: string }>) => {
    setBanner(null);
    setMismatches(null);
    setDialog(null);
    clear();
    try {
      const { job_id } = await fn();
      setActiveJob(name, job_id);
      start(job_id);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Could not start the job", "error");
    }
  };

  const runInfer = async () => {
    setBanner(null);
    setMismatches(null);
    clear();
    try {
      const { job_id } = await api.infer(name);
      inferJob.start(job_id);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Could not run inference", "error");
    }
  };

  const runDedup = async (mode: "exact" | "outliers") => {
    setBanner(null);
    setMismatches(null);
    setFlaggedIds(null);
    setDupeGroups(null);
    clear();
    dedupMode.current = mode;
    try {
      const { job_id } = await api.dedup(name, mode);
      start(job_id);
    } catch (e) {
      dedupMode.current = null;
      notify(e instanceof ApiError ? e.message : "Could not run the scan", "error");
    }
  };

  const clearFlagged = () => {
    setFlaggedIds(null);
    setDupeGroups(null);
    setBanner(null);
  };

  const rename = async (newName: string) => {
    setRenameError("");
    try {
      const { name: slug } = await api.renameDataset(name, newName);
      setDialog(null);
      nav(`/d/${slug}`);
    } catch (e) {
      setRenameError(e instanceof ApiError ? e.message : "Could not rename");
    }
  };

  const refreshFromDisk = async () => {
    setBanner(null);
    try {
      const { added, pruned } = await api.refresh(name);
      notify(`Refreshed: ${added} added, ${pruned} pruned`, "success");
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

  const moveSelectedTo = async (subject: string) => {
    const ids = [...selected];
    if (!ids.length || !subject) return;
    await api.moveToClass(name, ids, subject);
    clearSelection();
    refresh();
  };

  const markSelected = async (status: Status) => {
    const ids = [...selected];
    if (!ids.length) return;
    await api.setStatusMany(name, ids, status);
    clearSelection();
    refresh();
  };

  // toggling an item's checkbox enters select mode, so the user can then click other
  // images to keep selecting without first hitting the Select button
  const toggleItem = (id: string) => {
    if (!selectMode && !selected.has(id)) setSelectMode(true);
    toggle(id);
  };

  if (loading || !detail)
    return <Header subtitle="Loading" mood="working" backTo="/" />;

  const s = detail.stats;

  return (
    <>
      <Header
        title={name}
        titleAction={
          <button
            onClick={() => setDialog("rename")}
            className="text-muted hover:text-primary p-1"
            title="Rename dataset"
            aria-label="Rename dataset"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        }
        subtitle={`${s.total} images, ${s.pending} unreviewed, ${s.valid} valid`}
        backTo="/"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={refreshFromDisk}
              className="border-border text-muted hover:bg-card flex h-10 w-10 items-center justify-center rounded-lg border"
              title="Refresh from disk"
              aria-label="Refresh from disk"
            >
              <RefreshIcon className="h-5 w-5" />
            </button>
            <Link
              to={`/d/${name}/bin`}
              className="border-border text-muted hover:bg-card flex h-10 w-10 items-center justify-center rounded-lg border"
              title="Recycle bin"
              aria-label="Recycle bin"
            >
              <TrashIcon className="h-5 w-5" />
            </Link>
          </div>
        }
      />

      <Expandable title="Summary">
        <SummaryPanel datasetName={name} onChanged={refresh} />
      </Expandable>

      <Expandable title="Tools" defaultOpen>
        <MLToolsPanel
          onGenerate={() => setDialog("generate")}
          onDuplicates={() => runDedup("exact")}
          onOutliers={() => runDedup("outliers")}
          onTrain={() => runJob(() => api.train(name, "mobilenet_v2", 8))}
          onClassify={runInfer}
        />
      </Expandable>

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

      {mismatches && (
        <MismatchPanel
          datasetName={name}
          mismatches={mismatches}
          onClose={() => setMismatches(null)}
          onChanged={refresh}
        />
      )}

      {detail.items.length > 0 && (
        <div className="mb-4 flex justify-end">
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
          <Select
            className="ml-auto w-32"
            value=""
            placeholder="Mark as"
            options={[
              { value: "valid", label: statusLabel("valid") },
              { value: "pending", label: statusLabel("pending") },
            ]}
            onChange={(v) => markSelected(v as Status)}
          />
          <Select
            className="w-40"
            value=""
            placeholder="Move to class"
            options={detail.subjects.map((c) => ({ value: c, label: prettyClass(c) }))}
            onChange={(v) => moveSelectedTo(v)}
          />
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
            sources={sourceOptions}
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
                onOpen={setOpenItem}
                onDelete={deleteOne}
              />
            ) : (
              <ImageGrid
                items={visible}
                selected={selected}
                selectMode={selectMode}
                onToggle={toggleItem}
                onSetSelected={setSelected}
                onOpen={setOpenItem}
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
        onClose={() => setOpenItem(null)}
        onDelete={deleteOne}
      />
      <GenerateDialog
        open={dialog === "generate"}
        classes={detail.subjects}
        onClose={() => setDialog(null)}
        onStart={(body) => runJob(() => api.generate(name, body))}
      />
      <RenameDialog
        open={dialog === "rename"}
        current={name}
        error={renameError}
        onClose={() => {
          setDialog(null);
          setRenameError("");
        }}
        onRename={rename}
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

