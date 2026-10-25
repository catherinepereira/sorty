import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import type { DatasetSummary } from "../types";
import { AppBar } from "../components/AppBar";
import { NewDatasetDialog } from "../components/NewDatasetDialog";
import { useConfirm } from "../hooks/useConfirm";
import { btn, btnDanger, btnPrimary } from "../ui";

const TH = "px-3 py-2.5 font-medium";
const TD = "px-3 py-2";

export function Home() {
  const nav = useNavigate();
  const [datasets, setDatasets] = useState<DatasetSummary[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const { ask, element } = useConfirm();

  const refresh = () =>
    api
      .listDatasets()
      .then(setDatasets)
      .catch(() => setDatasets([]));

  useEffect(() => {
    refresh();
  }, []);

  // reconcile every dataset's manifest with its stored files, then re-list
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

  const importZip = async (file: File) => {
    setImporting(true);
    setError("");
    try {
      const { name } = await api.importZip(file);
      nav(`/d/${name}`);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Could not import that zip",
      );
    } finally {
      setImporting(false);
    }
  };

  const importButton = (
    <label
      className={`${btn} cursor-pointer ${importing ? "pointer-events-none opacity-50" : ""}`}
      title="A Sorty export, or a zip with one folder per class"
    >
      {importing ? "Importing" : "Import zip…"}
      <input
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) importZip(file);
        }}
      />
    </label>
  );

  const remove = async (name: string) => {
    const ok = await ask({
      title: "Delete dataset",
      message: `Delete "${name}" and all its images? This can't be undone.`,
      confirmLabel: "Delete dataset",
      danger: true,
    });
    if (!ok) return;
    await api.deleteDataset(name);
    refresh();
  };

  return (
    <>
      <AppBar
        crumbs={<span className="font-semibold">Datasets</span>}
        meta={datasets && `${datasets.length} in this browser`}
        actions={
          <>
            <button className={btn} onClick={syncAll} disabled={syncing}>
              {syncing ? "Syncing" : "Sync"}
            </button>
            {importButton}
            <button className={btnPrimary} onClick={() => setDialogOpen(true)}>
              New dataset…
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-[1600px] px-6 py-5">
        {error && (
          <p className="border-bad-line bg-bad/10 text-bad mb-3 rounded-lg border px-3 py-2">
            {error}
          </p>
        )}
        {datasets && datasets.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center gap-3 rounded-lg border px-6 py-16 text-center">
            <p className="text-muted">
              No datasets yet. Datasets are stored in this browser.
            </p>
            <div className="flex gap-2">
              {importButton}
              <button
                className={btnPrimary}
                onClick={() => setDialogOpen(true)}
              >
                New dataset…
              </button>
            </div>
          </div>
        ) : (
          <div className="border-border bg-card relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="bg-bg text-muted text-left text-xs">
                  <th scope="col" className="w-20 py-2.5 pl-3">
                    <span className="sr-only">Cover</span>
                  </th>
                  <th scope="col" className={TH}>
                    Name
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Images
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Classes
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Unreviewed
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Reviewed
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(datasets ?? []).map((d) => (
                  <tr key={d.name} className="border-subtle border-t">
                    <td className="py-2 pl-3">
                      <Link to={`/d/${d.name}`} aria-label={`Open ${d.name}`}>
                        {d.thumbnail ? (
                          <img
                            src={d.thumbnail}
                            alt=""
                            className="h-12 w-16 rounded object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="bg-subtle h-12 w-16 rounded" />
                        )}
                      </Link>
                    </td>
                    <td className={TD}>
                      <Link
                        to={`/d/${d.name}`}
                        className="font-semibold hover:underline"
                      >
                        {d.name}
                      </Link>
                    </td>
                    <td className={`${TD} text-right font-mono`}>{d.total}</td>
                    <td className={`${TD} text-right font-mono`}>
                      {d.subjects}
                    </td>
                    <td className={`${TD} text-right font-mono`}>
                      {d.pending}
                    </td>
                    <td className={`${TD} text-right font-mono`}>{d.valid}</td>
                    <td className={`${TD} text-right`}>
                      <div className="flex justify-end gap-2">
                        <button
                          className={btn}
                          onClick={() => nav(`/d/${d.name}`)}
                        >
                          Open
                        </button>
                        <button
                          className={btnDanger}
                          onClick={() => remove(d.name)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

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
