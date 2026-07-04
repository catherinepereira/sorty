import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useDataset } from "../stores/dataset";
import { useJob } from "../hooks/useJob";
import { useConfirm } from "../hooks/useConfirm";
import { Header } from "../components/Header";
import { ImageCard } from "../components/ImageCard";
import { AnnotateDialog } from "../components/AnnotateDialog";
import { GenerateDialog } from "../components/GenerateDialog";
import { JobProgress } from "../components/JobProgress";
import { MismatchPanel } from "../components/MismatchPanel";
import type { Item, JobState, Prediction } from "../types";

export function DatasetPage() {
  const { name = "" } = useParams();
  const {
    detail,
    loading,
    selected,
    load,
    refresh,
    toggle,
    selectAll,
    clearSelection,
  } = useDataset();
  const { ask, element: confirmEl } = useConfirm();

  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [mismatches, setMismatches] = useState<Prediction[] | null>(null);
  const [torchOk, setTorchOk] = useState(true);
  const [banner, setBanner] = useState("");

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
    clear();
    try {
      start((await fn()).job_id);
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : "Could not start the job");
    }
  };

  const generate = (body: Parameters<typeof api.generate>[1]) => {
    setGenOpen(false);
    runJob(() => api.generate(name, body));
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

  const deleteOne = async (id: string) => {
    await api.del(name, [id]);
    setOpenItem(null);
    refresh();
  };

  if (loading || !detail)
    return <Header subtitle="Loading" mood="working" backTo="/" />;

  const s = detail.stats;

  return (
    <>
      <Header
        subtitle={`${s.total} images, ${s.valid} valid, ${s.pending} pending`}
        backTo="/"
        actions={
          <Link
            to={`/d/${name}/bin`}
            className="border-border text-muted hover:bg-card rounded-lg border px-4 py-2"
          >
            Recycle bin
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <ToolbarButton onClick={() => setGenOpen(true)}>Generate</ToolbarButton>
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
          No images yet. Generate some to get started.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {detail.items.map((item) => (
            <ImageCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
              onOpen={() => setOpenItem(item)}
            />
          ))}
        </div>
      )}

      <AnnotateDialog
        item={openItem}
        datasetName={name}
        onClose={() => setOpenItem(null)}
        onDelete={deleteOne}
      />
      <GenerateDialog
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onStart={generate}
      />
      {confirmEl}
    </>
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
