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
import { PencilIcon, RefreshIcon, TrashIcon } from "../components/icons";
import type { Item, JobState, Prediction } from "../types";

type DialogName = "generate" | "rename" | null;

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
  const [banner, setBanner] = useState("");
  const [renameError, setRenameError] = useState("");
  const [filters, setFilters] = useState<Filters>({
    classes: new Set(),
    sources: new Set(),
    statuses: new Set(),
  });

  const items = useMemo(() => detail?.items ?? [], [detail]);

  const visible = useMemo(() => {
    return items.filter((i) => {
      if (filters.classes.size && !filters.classes.has(i.subject)) return false;
      if (filters.sources.size && !filters.sources.has(i.source)) return false;
      if (filters.statuses.size && !filters.statuses.has(i.status)) return false;
      return true;
    });
  }, [items, filters]);

  const onJobDone = (job: JobState) => {
    refresh();
    if (job.status === "error") setBanner(job.error);
  };
  const { job, start, running, clear } = useJob(onJobDone);

  useEffect(() => {
    load(name);
  }, [name, load]);

  const runJob = async (fn: () => Promise<{ job_id: string }>) => {
    setBanner("");
    setMismatches(null);
    setDialog(null);
    clear();
    try {
      start((await fn()).job_id);
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : "Could not start the job");
    }
  };

  const runInfer = async () => {
    setBanner("");
    setMismatches(null);
    clear();
    try {
      const { job_id } = await api.infer(name);
      const poll = window.setInterval(async () => {
        const state = await api.job(job_id);
        if (state.status !== "running") {
          window.clearInterval(poll);
          if (state.status === "done")
            setMismatches(state.result as Prediction[]);
          else setBanner(state.error);
        }
      }, 700);
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : "Could not run inference");
    }
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
    setBanner("");
    try {
      const { added, pruned } = await api.refresh(name);
      setBanner(`Refreshed: ${added} added, ${pruned} pruned.`);
      refresh();
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : "Could not refresh");
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
        subtitle={`${s.total} images, ${s.pending} pending, ${s.valid} valid`}
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

      <Expandable title="Dataset tools" defaultOpen>
        <MLToolsPanel
          onGenerate={() => setDialog("generate")}
          onDuplicates={() => runJob(() => api.dedup(name, "exact"))}
          onOutliers={() => runJob(() => api.dedup(name, "outliers"))}
          onTrain={() => runJob(() => api.train(name, "mobilenet_v2", 8))}
          onClassify={runInfer}
        />
      </Expandable>

      {banner && (
        <p className="bg-bad/10 text-bad mb-4 rounded-lg px-4 py-2 text-sm">
          {banner}
        </p>
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
          <select
            className="border-border ml-auto rounded-lg border bg-transparent px-2 py-1.5 text-sm"
            value=""
            onChange={(e) => {
              moveSelectedTo(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Move to class</option>
            {detail.subjects.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
            sources={detail.sources}
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

function ImageGrid({
  items,
  selected,
  selectMode,
  onToggle,
  onSetSelected,
  onOpen,
  onDelete,
}: {
  items: Item[];
  selected: Set<string>;
  selectMode: boolean;
  onToggle: (id: string) => void;
  onSetSelected: (id: string, on: boolean) => void;
  onOpen: (item: Item) => void;
  onDelete: (id: string) => void;
}) {
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

