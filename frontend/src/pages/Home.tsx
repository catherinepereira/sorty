import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { DatasetSummary } from "../types";
import { Header } from "../components/Header";
import { NewDatasetDialog } from "../components/NewDatasetDialog";
import { useConfirm } from "../hooks/useConfirm";
import { PlusIcon, RefreshIcon, TrashIcon } from "../components/icons";

export function Home() {
  const nav = useNavigate();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { ask, element } = useConfirm();

  const refresh = () =>
    api
      .listDatasets()
      .then(setDatasets)
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, []);

  // reconcile every dataset's manifest with the files on disk, then re-list
  const syncAll = async () => {
    setSyncing(true);
    try {
      const current = await api.listDatasets();
      await Promise.all(
        current.map((d) => api.refresh(d.name).catch(() => {})),
      );
      await refresh();
    } finally {
      setSyncing(false);
    }
  };

  const remove = async (name: string) => {
    const ok = await ask({
      title: "Delete dataset",
      message: `Delete "${name}" and all its images? It goes to your computer's recycle bin.`,
      confirmLabel: "Delete dataset",
      danger: true,
    });
    if (!ok) return;
    await api.deleteDataset(name);
    refresh();
  };

  return (
    <>
      <Header
        subtitle="Build and clean image datasets"
        actions={
          <button
            onClick={syncAll}
            disabled={syncing}
            className="border-good/30 bg-good/10 text-good hover:bg-good/20 flex h-10 w-10 items-center justify-center rounded-lg border disabled:opacity-50"
            title="Sync datasets to disk"
            aria-label="Sync datasets to disk"
          >
            <RefreshIcon
              className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`}
            />
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {datasets.map((d) => (
          <DatasetCard key={d.name} d={d} onDelete={() => remove(d.name)} />
        ))}
        <button
          onClick={() => setDialogOpen(true)}
          className="border-border text-muted hover:border-primary hover:text-primary flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition"
        >
          <PlusIcon className="h-6 w-6" />
          <span className="font-medium">New dataset</span>
        </button>
      </div>

      <NewDatasetDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onDone={(name) => {
          setDialogOpen(false);
          nav(`/d/${name}`);
        }}
      />
      {element}
    </>
  );
}

function DatasetCard({
  d,
  onDelete,
}: {
  d: DatasetSummary;
  onDelete: () => void;
}) {
  return (
    <div className="group border-border bg-card relative overflow-hidden rounded-xl border transition hover:shadow-md">
      <button
        onClick={onDelete}
        className="bg-bad/90 absolute top-2 right-2 z-[1] flex h-7 w-7 items-center justify-center rounded-full text-white opacity-0 transition group-hover:opacity-100"
        title={`Delete ${d.name}`}
        aria-label={`Delete ${d.name}`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
      <Link to={`/d/${d.name}`} className="block">
        <div className="bg-primary-soft flex aspect-video items-center justify-center">
          {d.thumbnail ? (
            <img
              src={d.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-muted">empty</span>
          )}
        </div>
        <div className="p-4">
          <h2 className="font-semibold">{d.name}</h2>
          <p className="text-muted mt-1 text-sm">
            {d.total} images, {d.pending} unreviewed, {d.valid} reviewed
          </p>
          <p className="text-muted text-xs">{d.subjects} classes</p>
        </div>
      </Link>
    </div>
  );
}
