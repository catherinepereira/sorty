import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { DatasetSummary } from "../types";
import { Header } from "../components/Header";
import { NewDatasetDialog } from "../components/NewDatasetDialog";
import { useConfirm } from "../hooks/useConfirm";
import { TrashIcon } from "../components/icons";

export function Home() {
  const nav = useNavigate();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { ask, element } = useConfirm();

  const refresh = () =>
    api
      .listDatasets()
      .then(setDatasets)
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, []);

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
            className="bg-primary rounded-lg px-4 py-2 font-medium text-white hover:brightness-95"
            onClick={() => setDialogOpen(true)}
          >
            New dataset
          </button>
        }
      />

      {datasets.length === 0 ? (
        <p className="text-muted mt-16 text-center">
          No datasets yet. Make one to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {datasets.map((d) => (
            <DatasetCard key={d.name} d={d} onDelete={() => remove(d.name)} />
          ))}
        </div>
      )}

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
            {d.total} images, {d.pending} pending, {d.valid} valid
          </p>
          <p className="text-muted text-xs">{d.subjects} classes</p>
        </div>
      </Link>
    </div>
  );
}
