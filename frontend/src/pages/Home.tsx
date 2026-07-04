import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import type { DatasetSummary } from "../types";
import { Header } from "../components/Header";
import { NewDatasetDialog } from "../components/NewDatasetDialog";

export function Home() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");

  const refresh = () =>
    api
      .listDatasets()
      .then(setDatasets)
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, []);

  const create = async (name: string, prompt: string) => {
    try {
      await api.createDataset(name, prompt);
      setDialogOpen(false);
      setError("");
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create dataset");
    }
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
            <DatasetCard key={d.name} d={d} />
          ))}
        </div>
      )}

      <NewDatasetDialog
        open={dialogOpen}
        error={error}
        onClose={() => {
          setDialogOpen(false);
          setError("");
        }}
        onCreate={create}
      />
    </>
  );
}

function DatasetCard({ d }: { d: DatasetSummary }) {
  return (
    <Link
      to={`/d/${d.name}`}
      className="border-border bg-card block overflow-hidden rounded-xl border transition hover:shadow-md"
    >
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
          {d.total} images, {d.subjects} subjects
        </p>
      </div>
    </Link>
  );
}
