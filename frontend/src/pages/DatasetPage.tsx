import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useDataset } from "../stores/dataset";
import { useJob } from "../hooks/useJob";
import { useConfirm } from "../hooks/useConfirm";
import { Header } from "../components/Header";
import { ImageCard } from "../components/ImageCard";
import { AnnotateDialog } from "../components/AnnotateDialog";
import { GenerateDialog } from "../components/GenerateDialog";
import { AddClassesDialog } from "../components/AddClassesDialog";
import { DeleteSourceDialog } from "../components/DeleteSourceDialog";
import { RenameDialog } from "../components/RenameDialog";
import { SummaryPanel } from "../components/SummaryPanel";
import { JobProgress } from "../components/JobProgress";
import { MismatchPanel } from "../components/MismatchPanel";
import { Dropdown, DropdownItem } from "../components/Dropdown";
import type { Item, JobState, Prediction } from "../types";

type DialogName =
  | "generate"
  | "addClasses"
  | "deleteSource"
  | "rename"
  | "summary"
  | null;

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
    selectAll,
    clearSelection,
    setSelectMode,
  } = useDataset();
  const { ask, element: confirmEl } = useConfirm();

  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [mismatches, setMismatches] = useState<Prediction[] | null>(null);
  const [torchOk, setTorchOk] = useState(true);
  const [banner, setBanner] = useState("");
  const [renameError, setRenameError] = useState("");

  const onJobDone = (job: JobState) => {
    refresh();
    if (job.status === "error") setBanner(job.error);
  };
  const { job, start, running, clear } = useJob(onJobDone);

  useEffect(() => {
    load(name);
    api.torch().then((r) => setTorchOk(r.available));
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

  const removeDataset = async () => {
    const ok = await ask({
      title: "Delete dataset",
      message: `Delete "${name}" and all its images? It goes to your computer's recycle bin.`,
      confirmLabel: "Delete dataset",
      danger: true,
    });
    if (!ok) return;
    await api.deleteDataset(name);
    nav("/");
  };

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

  if (loading || !detail)
    return <Header subtitle="Loading" mood="working" backTo="/" />;

  const s = detail.stats;

  return (
    <>
      <Header
        subtitle={`${s.total} images, ${s.pending} pending, ${s.valid} valid`}
        backTo="/"
        actions={
          <div className="flex gap-2">
            <Link
              to={`/d/${name}/bin`}
              className="border-border text-muted hover:bg-card rounded-lg border px-4 py-2"
            >
              Recycle bin
            </Link>
            <Dropdown label="Actions">
              {(close) => (
                <>
                  <DropdownItem
                    onClick={() => {
                      setDialog("addClasses");
                      close();
                    }}
                  >
                    Add or edit classes
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      setDialog("summary");
                      close();
                    }}
                  >
                    View summary
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      refreshFromDisk();
                      close();
                    }}
                  >
                    Refresh from disk
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      setDialog("deleteSource");
                      close();
                    }}
                  >
                    Delete by source
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      setDialog("rename");
                      close();
                    }}
                  >
                    Rename dataset
                  </DropdownItem>
                  <DropdownItem
                    danger
                    onClick={() => {
                      removeDataset();
                      close();
                    }}
                  >
                    Delete dataset
                  </DropdownItem>
                </>
              )}
            </Dropdown>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <ToolbarButton onClick={() => setDialog("generate")}>
          Generate
        </ToolbarButton>
        <ToolbarButton onClick={() => runJob(() => api.dedup(name, "exact"))}>
          Find duplicates
        </ToolbarButton>
        <ToolbarButton
          disabled={!torchOk}
          onClick={() => runJob(() => api.dedup(name, "outliers"))}
        >
          Find outliers
        </ToolbarButton>
        <ToolbarButton
          disabled={!torchOk}
          onClick={() => runJob(() => api.train(name, "mobilenet_v2", 8))}
        >
          Train
        </ToolbarButton>
        <ToolbarButton disabled={!torchOk} onClick={runInfer}>
          Run classifier
        </ToolbarButton>
        <button
          onClick={() => setSelectMode(!selectMode)}
          className={`ml-auto rounded-lg px-4 py-2 font-medium ${
            selectMode ? "bg-primary text-white" : "bg-card shadow-sm"
          }`}
        >
          {selectMode ? "Done selecting" : "Select"}
        </button>
      </div>

      {!torchOk && (
        <p className="text-muted mb-4 text-sm">
          Training and the classifier need PyTorch. Install the backend train
          extra to enable them.
        </p>
      )}

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

      {selected.size > 0 && (
        <div className="border-primary bg-primary-soft sticky top-2 z-10 mb-4 flex items-center gap-3 rounded-xl border px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            className="text-muted hover:text-text text-sm"
            onClick={selectAll}
          >
            Select all
          </button>
          <button
            className="text-muted hover:text-text text-sm"
            onClick={clearSelection}
          >
            Clear
          </button>
          <button
            className="bg-bad ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-white"
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
        <ImageGrid
          items={detail.items}
          selected={selected}
          selectMode={selectMode}
          onToggle={toggle}
          onSetSelected={setSelected}
          onOpen={setOpenItem}
          onDelete={deleteOne}
        />
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
      <AddClassesDialog
        open={dialog === "addClasses"}
        datasetName={name}
        current={detail.subjects}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          refresh();
        }}
      />
      <DeleteSourceDialog
        open={dialog === "deleteSource"}
        datasetName={name}
        onClose={() => setDialog(null)}
        onDeleted={() => {
          setDialog(null);
          refresh();
        }}
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
      {dialog === "summary" && (
        <SummaryPanel datasetName={name} onClose={() => setDialog(null)} />
      )}
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

function ToolbarButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-card rounded-lg px-4 py-2 font-medium shadow-sm hover:shadow disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
