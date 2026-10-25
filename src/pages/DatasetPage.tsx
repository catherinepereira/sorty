import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type ModelReport, type Upload } from "../api";
import { useDataset } from "../stores/dataset";
import { useJob } from "../hooks/useJob";
import { useConfirm } from "../hooks/useConfirm";
import { AppBar } from "../components/AppBar";
import { ImageCard } from "../components/ImageCard";
import { ImageTable } from "../components/ImageTable";
import { AnnotateDialog } from "../components/AnnotateDialog";
import { GenerateDialog } from "../components/GenerateDialog";
import { TrainDialog } from "../components/TrainDialog";
import { ExportDatasetDialog } from "../components/ExportDatasetDialog";
import { CreateSplitsDialog } from "../components/CreateSplitsDialog";
import { AddImagesDialog } from "../components/AddImagesDialog";
import { collectDropped } from "../dropped";
import { SummaryPanel } from "../components/SummaryPanel";
import { TrainingPanel } from "../components/TrainingPanel";
import { Modal } from "../components/Modal";
import { Menu } from "../components/Menu";
import { JobProgress } from "../components/JobProgress";
import {
  SelectionPanel,
  type SelectionChanges,
} from "../components/SelectionPanel";
import { CloseIcon, PencilIcon } from "../components/icons";
import type { Item, JobState, Status } from "../types";
import { statusLabel } from "../status";
import { prettyClass } from "../classname";
import { clearActiveJob, getActiveJob, setActiveJob } from "../activeJobs";
import { getViewPrefs, setViewPrefs, type ViewPrefs } from "../settings";
import { btn, btnPrimary, field } from "../ui";

type DialogName =
  | "generate"
  | "add"
  | "crossval"
  | "train"
  | "createSplits"
  | "exportData"
  | "classes"
  | "model"
  | null;

// classes is a multi-select chip row, the rest are single dropdowns where "" means any
type Filters = {
  classes: Set<string>;
  status: "" | Status;
  model: "" | "correct" | "mismatch";
  source: string;
  split: string;
};

const NO_FILTERS: Filters = {
  classes: new Set(),
  status: "",
  model: "",
  source: "",
  split: "",
};

// higher is more worth a look: disagreements by the model's confidence, then
// agreements it was unsure of, then images it never predicted
function suspicion(i: Item): number {
  if (i.predicted === null) return -1;
  if (i.predicted !== i.label) return 1 + (i.predicted_score ?? 0);
  return 1 - (i.predicted_score ?? 1);
}

// minimum card width per thumbnail size
const CARD_WIDTH = { s: 150, m: 200, l: 270 } as const;

const BANNER_TONE = {
  success: "border-good/30 bg-good-soft text-good",
  error: "border-bad-line bg-bad/10 text-bad",
  info: "border-warn-line bg-warn-soft text-warn",
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
    replaceItem,
  } = useDataset();
  const { ask, element: confirmEl } = useConfirm();

  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [banner, setBanner] = useState<{
    text: string;
    tone: "info" | "success" | "error";
  } | null>(null);
  const notify = useCallback(
    (text: string, tone: "info" | "success" | "error" = "info") =>
      setBanner({ text, tone }),
    [],
  );
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [datasetNames, setDatasetNames] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [flaggedIds, setFlaggedIds] = useState<string[] | null>(null);
  // set for exact dedup: each inner list is one duplicate set, rendered on its own row
  const [dupeGroups, setDupeGroups] = useState<string[][] | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<"" | "suspect">("");
  // files dropped on the page, handed to the Add images dialog
  const [dropped, setDropped] = useState<Upload[]>([]);
  const [prefs, setPrefs] = useState<ViewPrefs>(getViewPrefs);
  const [page, setPage] = useState(0);

  const updatePrefs = (patch: Partial<ViewPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setViewPrefs(next);
    setPage(0);
  };
  const patchFilters = (patch: Partial<Filters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  const items = useMemo(() => detail?.items ?? [], [detail]);

  // only sources that appear on items, so the filter never offers an empty bucket
  const sourceOptions = useMemo(
    () => [...new Set(items.map((i) => i.source))].sort(),
    [items],
  );

  // per-class counts under the active status filter, so picking Unreviewed shows how
  // many of each class are left to review
  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) {
      if (filters.status && i.status !== filters.status) continue;
      counts[i.label] = (counts[i.label] ?? 0) + 1;
    }
    return counts;
  }, [items, filters.status]);
  const countedTotal = Object.values(classCounts).reduce((a, b) => a + b, 0);

  const hasPredictions = useMemo(
    () => items.some((i) => i.predicted !== null),
    [items],
  );

  // split options, hidden entirely while no item sits in a split
  const splitOptions = useMemo(() => {
    const present = new Set(items.map((i) => i.split ?? "none"));
    if (![...present].some((k) => k !== "none")) return [];
    return ["train", "test", "valid", "none"].filter((k) => present.has(k));
  }, [items]);

  const visible = useMemo(() => {
    const flagged = flaggedIds ? new Set(flaggedIds) : null;
    const q = query.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (flagged && !flagged.has(i.id)) return false;
      if (q) {
        const hay =
          `${i.id} ${i.title} ${i.source_url} ${i.label} ${prettyClass(i.label)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.classes.size && !filters.classes.has(i.label)) return false;
      if (filters.source && i.source !== filters.source) return false;
      if (filters.status && i.status !== filters.status) return false;
      if (filters.model) {
        // images without a prediction match neither bucket
        if (!i.predicted) return false;
        const bucket = i.predicted === i.label ? "correct" : "mismatch";
        if (bucket !== filters.model) return false;
      }
      if (filters.split && (i.split ?? "none") !== filters.split) return false;
      return true;
    });
    if (!flaggedIds) {
      return sort === "suspect"
        ? [...filtered].sort((a, b) => suspicion(b) - suspicion(a))
        : filtered;
    }
    // show flagged images in the order the scan returned them, so duplicate groups stay
    // adjacent instead of scattered by manifest order
    const rank = new Map(flaggedIds.map((id, n) => [id, n]));
    return [...filtered].sort(
      (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    );
  }, [items, filters, flaggedIds, query, sort]);

  // back to the first page whenever the filtered set changes shape
  useEffect(() => setPage(0), [filters, query, flaggedIds, sort]);

  const perPage = prefs.perPage || visible.length || 1;
  const pageCount = Math.max(1, Math.ceil(visible.length / perPage));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageItems = useMemo(
    () => visible.slice(pageIndex * perPage, (pageIndex + 1) * perPage),
    [visible, pageIndex, perPage],
  );

  // the saved model's training report and run history, shown in the Model dialog
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
        notify("No duplicates found.");
        return;
      }
      setFlaggedIds(ids);
      setDupeGroups(result.groups);
      notify(
        `Showing ${ids.length} possible duplicate${ids.length === 1 ? "" : "s"}. Delete the copies you don't want, or clear the filter.`,
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
      added?: number;
      skipped?: number;
      failed?: number;
    } | null;
    if (result && result.mismatched !== undefined) {
      notify(
        `The model predicted ${result.predicted} images, ${result.mismatched} disagree with their label. Sort by Likely mislabeled or set Model to Disagrees to review them.`,
        "success",
      );
    } else if (result && result.added !== undefined) {
      const extra = [
        result.skipped &&
          `${result.skipped} skipped (already added, or no class)`,
        result.failed && `${result.failed} unreadable`,
      ].filter(Boolean);
      notify(
        `Added ${result.added} image${result.added === 1 ? "" : "s"}${extra.length ? `, ${extra.join(", ")}` : ""}.`,
        result.added ? "success" : "info",
      );
    } else if (result && result.overall_accuracy !== undefined) {
      loadModelInfo();
      notify(
        `Model trained, ${Math.round(result.overall_accuracy * 100)}% validation accuracy. The full report is under Model.`,
        "success",
      );
    }
  };
  const { job, start, running, clear } = useJob(onJobDone);
  const busy = Boolean(job && running);

  useEffect(() => {
    load(name);
    loadModelInfo();
    api
      .listDatasets()
      .then((ds) => setDatasetNames(ds.map((d) => d.name)))
      .catch(() => {});
    // reattach to a generate/train job left running when the page was last open,
    // dropping the stored id if that job no longer exists (a reload ends jobs)
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

  const openAdd = () => {
    setDropped([]);
    setDialog("add");
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

  const syncStorage = async () => {
    setBanner(null);
    try {
      const { added, pruned } = await api.refresh(name);
      notify(
        `Synced with storage: ${added} added, ${pruned} pruned.`,
        "success",
      );
      refresh();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Could not sync", "error");
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

  const relabel = useCallback(
    async (id: string, label: string) => {
      try {
        const { item } = await api.setLabel(name, id, label);
        replaceItem(item);
      } catch (e) {
        notify(
          e instanceof ApiError ? e.message : "Could not change the class",
          "error",
        );
      }
    },
    [name, replaceItem, notify],
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

  // apply the queued selection-bar changes in one pass, each over its batch endpoint
  const applySelection = async (changes: SelectionChanges) => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      if (changes.status) await api.setStatusMany(name, ids, changes.status);
      if (changes.subject) await api.moveToClass(name, ids, changes.subject);
      if (changes.split) await api.moveSplit(name, ids, changes.split);
      if (changes.flipY) await api.flipItems(name, ids, "y");
      if (changes.flipX) await api.flipItems(name, ids, "x");
    } catch (e) {
      await refresh();
      notify(
        e instanceof ApiError ? e.message : "Could not apply changes",
        "error",
      );
      // rethrow so the bar keeps the queued changes for a retry
      throw e;
    }
    clearSelection();
    await refresh();
    const parts: string[] = [];
    if (changes.status) parts.push(`marked ${statusLabel(changes.status)}`);
    if (changes.subject) parts.push(`moved to ${prettyClass(changes.subject)}`);
    if (changes.split)
      parts.push(
        changes.split === "none"
          ? "removed from splits"
          : `moved to the ${changes.split} split`,
      );
    if (changes.flipY) parts.push("mirrored left-right");
    if (changes.flipX) parts.push("flipped top-bottom");
    notify(
      `${ids.length} image${ids.length === 1 ? "" : "s"}: ${parts.join(", ")}.`,
      "success",
    );
  };

  const selectedDisagreements = useMemo(
    () =>
      items.filter(
        (i) => selected.has(i.id) && i.predicted && i.predicted !== i.label,
      ),
    [items, selected],
  );

  // move every selected disagreement to its predicted class, one batch per class
  const acceptModelLabels = async () => {
    const byClass = new Map<string, string[]>();
    for (const i of selectedDisagreements) {
      byClass.set(i.predicted!, [...(byClass.get(i.predicted!) ?? []), i.id]);
    }
    try {
      for (const [label, ids] of byClass) {
        await api.moveToClass(name, ids, label);
      }
      notify(
        `Moved ${selectedDisagreements.length} image${selectedDisagreements.length === 1 ? "" : "s"} to the model's class.`,
        "success",
      );
    } catch (e) {
      notify(
        e instanceof ApiError ? e.message : "Could not move the images",
        "error",
      );
    }
    clearSelection();
    refresh();
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
  // images to keep selecting
  const toggleItem = useCallback(
    (id: string) => {
      if (!selectMode && !selected.has(id)) setSelectMode(true);
      toggle(id);
    },
    [selectMode, selected, setSelectMode, toggle],
  );

  const clearAllSelection = () => {
    clearSelection();
    setSelectMode(false);
  };

  // the popup's navigation order, frozen when it opens. An edit that drops the image
  // out of the current filters (e.g. marking it reviewed under an Unreviewed filter)
  // then keeps the arrows, so a review pass can keep stepping through the sequence
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

  if (loading || !detail) return <AppBar crumbs={name} meta="Loading" />;

  const s = detail.stats;
  const filtering =
    query ||
    filters.classes.size ||
    filters.status ||
    filters.model ||
    filters.source ||
    filters.split;

  const gridProps: GridProps = {
    classes: detail.subjects,
    selected,
    selectMode,
    cardWidth: CARD_WIDTH[prefs.size],
    onToggle: toggleItem,
    onSetSelected: setSelected,
    onOpen: openPanel,
    onDelete: deleteOne,
    onRelabel: relabel,
  };

  return (
    <>
      <AppBar
        crumbs={
          editingName ? (
            <input
              autoFocus
              className={`${field} h-8 w-56 font-semibold`}
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
            <span className="flex items-center gap-1">
              <select
                value={name}
                onChange={(e) => nav(`/d/${e.target.value}`)}
                className={`${field} h-8 font-semibold`}
                aria-label="Dataset"
              >
                {(datasetNames.includes(name)
                  ? datasetNames
                  : [name, ...datasetNames]
                ).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setNameDraft(name);
                  setEditingName(true);
                }}
                className="text-muted hover:bg-subtle hover:text-text flex h-8 w-8 items-center justify-center rounded-md"
                title="Rename dataset"
                aria-label="Rename dataset"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            </span>
          )
        }
        meta={`${s.total} images, ${detail.subjects.length} classes`}
        actions={
          <>
            <button className={btn} onClick={runDedup} disabled={busy}>
              Find duplicates
            </button>
            <button
              className={btn}
              onClick={() => runJob(() => api.checkLabels(name))}
              disabled={busy}
              title="Predict each image's class from the class names, no training needed"
            >
              Check labels
            </button>
            <button
              className={btn}
              onClick={() => setDialog("crossval")}
              disabled={busy}
            >
              Cross-validate
            </button>
            <button
              className={btn}
              onClick={() => setDialog("model")}
              title="Train a model, see its report, export it"
            >
              Train
              {modelReport && (
                <span className="text-muted font-mono text-xs">
                  {Math.round(modelReport.overall_accuracy * 100)}%
                </span>
              )}
            </button>
            <button className={btn} onClick={() => setDialog("exportData")}>
              Export
            </button>
            <Menu
              label="More"
              items={[
                {
                  label: "Classes and sources",
                  onSelect: () => setDialog("classes"),
                },
                { label: "Add images", onSelect: openAdd, disabled: busy },
                {
                  label: "Create splits",
                  onSelect: () => setDialog("createSplits"),
                  disabled: detail.locks.splits,
                  title: detail.locks.splits
                    ? "Splits are locked for this dataset"
                    : undefined,
                },
                { label: "Sync with storage", onSelect: syncStorage },
                { label: "Recycle bin", onSelect: () => nav(`/d/${name}/bin`) },
              ]}
            />
            <button
              className={btnPrimary}
              onClick={() => setDialog("generate")}
              disabled={busy}
            >
              Fetch images
            </button>
          </>
        }
      />

      <main
        className="mx-auto flex max-w-[1600px] flex-col gap-3.5 px-6 py-5"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files") || busy) return;
          e.preventDefault();
          collectDropped(e.dataTransfer).then((uploads) => {
            setDropped(uploads);
            setDialog("add");
          });
        }}
      >
        {/* class chips: a multi-select filter, All clears it */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted mr-1">Class</span>
          <Chip
            on={filters.classes.size === 0}
            onClick={() => patchFilters({ classes: new Set() })}
          >
            All <span className="font-mono opacity-75">{countedTotal}</span>
          </Chip>
          {detail.subjects.map((c) => (
            <Chip
              key={c}
              on={filters.classes.has(c)}
              onClick={() => {
                const next = new Set(filters.classes);
                if (next.has(c)) next.delete(c);
                else next.add(c);
                patchFilters({ classes: next });
              }}
            >
              {prettyClass(c)}{" "}
              <span className="font-mono opacity-75">
                {classCounts[c] ?? 0}
              </span>
            </Chip>
          ))}
          <button
            onClick={() => setDialog("classes")}
            className="border-border text-muted hover:text-text h-8 rounded-full border border-dashed px-3"
          >
            + Class
          </button>
        </div>

        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${field} flex min-w-60 flex-1 items-center gap-2`}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted shrink-0"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="Search id, title, source URL"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search"
            />
          </label>
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => patchFilters({ status: v as Filters["status"] })}
            options={[
              ["", "Any"],
              ["pending", statusLabel("pending")],
              ["valid", statusLabel("valid")],
            ]}
          />
          {hasPredictions && (
            <FilterSelect
              label="Sort"
              value={sort}
              onChange={(v) => setSort(v as typeof sort)}
              options={[
                ["", "Default"],
                ["suspect", "Likely mislabeled"],
              ]}
            />
          )}
          {hasPredictions && (
            <FilterSelect
              label="Model"
              value={filters.model}
              warn={filters.model === "mismatch"}
              onChange={(v) => patchFilters({ model: v as Filters["model"] })}
              options={[
                ["", "Any"],
                ["mismatch", "Disagrees"],
                ["correct", "Agrees"],
              ]}
            />
          )}
          {sourceOptions.length > 1 && (
            <FilterSelect
              label="Source"
              value={filters.source}
              onChange={(v) => patchFilters({ source: v })}
              options={[["", "Any"], ...sourceOptions.map((o) => [o, o])]}
            />
          )}
          {splitOptions.length > 0 && (
            <FilterSelect
              label="Split"
              value={filters.split}
              onChange={(v) => patchFilters({ split: v })}
              options={[
                ["", "Any"],
                ...splitOptions.map((o) => [o, o === "none" ? "No split" : o]),
              ]}
            />
          )}
          {prefs.view === "grid" && (
            <FilterSelect
              label="Size"
              value={prefs.size}
              onChange={(v) => updatePrefs({ size: v as ViewPrefs["size"] })}
              options={[
                ["s", "Small"],
                ["m", "Medium"],
                ["l", "Large"],
              ]}
            />
          )}
          <div
            role="group"
            aria-label="View"
            className="border-border bg-card flex overflow-hidden rounded-md border"
          >
            {(["grid", "table"] as const).map((v, n) => (
              <button
                key={v}
                aria-pressed={prefs.view === v}
                onClick={() => updatePrefs({ view: v })}
                className={`h-[34px] px-3 capitalize ${n ? "border-border border-l" : ""} ${
                  prefs.view === v
                    ? "bg-subtle font-semibold"
                    : "hover:bg-subtle"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <label className="text-muted flex items-center gap-1.5 pl-1">
            <input
              type="checkbox"
              checked={detail.locks.splits}
              onChange={() => toggleLock("splits")}
              className="accent-primary"
            />
            Lock splits
          </label>
          <label className="text-muted flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={detail.locks.review}
              onChange={() => toggleLock("review")}
              className="accent-primary"
            />
            Lock review
          </label>
        </div>

        {banner && (
          <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${BANNER_TONE[banner.tone]}`}
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

        {job && running && <JobProgress job={job} />}

        {selected.size > 0 && (
          <SelectionPanel
            count={selected.size}
            classes={detail.subjects}
            locks={detail.locks}
            disagreements={selectedDisagreements.length}
            onSelectAll={selectVisible}
            onClear={clearAllSelection}
            onApply={applySelection}
            onAcceptModel={acceptModelLabels}
            onDelete={deleteSelected}
          />
        )}

        {detail.items.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center gap-3 rounded-lg border px-6 py-16 text-center">
            <p className="text-muted">
              No images yet. Add classes and fetch images for them, or add your
              own. You can also drop images or folders here.
            </p>
            <div className="flex gap-2">
              <button className={btn} onClick={() => setDialog("classes")}>
                Add classes
              </button>
              <button className={btn} onClick={openAdd}>
                Add images…
              </button>
              <button
                className={btnPrimary}
                onClick={() => setDialog("generate")}
              >
                Fetch images…
              </button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-muted py-16 text-center">
            No images match the current filters.
            {filtering && (
              <button
                className="text-primary ml-2 hover:underline"
                onClick={() => {
                  setFilters(NO_FILTERS);
                  setQuery("");
                }}
              >
                Reset filters
              </button>
            )}
          </p>
        ) : prefs.view === "table" ? (
          <ImageTable
            items={pageItems}
            classes={detail.subjects}
            selected={selected}
            onToggle={toggleItem}
            onToggleAll={(on) =>
              pageItems.forEach((i) => setSelected(i.id, on))
            }
            onOpen={openPanel}
            onRelabel={relabel}
          />
        ) : dupeGroups ? (
          <DuplicateGroups
            groups={dupeGroups}
            items={pageItems}
            {...gridProps}
          />
        ) : (
          <ImageGrid items={pageItems} {...gridProps} />
        )}

        {visible.length > 0 && (
          <div className="border-border bg-card text-muted flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
            <span>
              Showing {pageIndex * perPage + 1} to{" "}
              {Math.min((pageIndex + 1) * perPage, visible.length)} of{" "}
              {visible.length}
              {visible.length !== items.length && ` (${items.length} total)`}
            </span>
            <div className="flex-1" />
            <label className="flex items-center gap-1.5">
              Per page
              <select
                className={`${field} h-8`}
                value={prefs.perPage}
                onChange={(e) =>
                  updatePrefs({ perPage: Number(e.target.value) })
                }
              >
                <option value={48}>48</option>
                <option value={96}>96</option>
                <option value={240}>240</option>
                <option value={0}>All</option>
              </select>
            </label>
            <button
              className={btn}
              disabled={pageIndex === 0}
              onClick={() => setPage(pageIndex - 1)}
            >
              Previous
            </button>
            <span className="font-mono text-xs">
              {pageIndex + 1}/{pageCount}
            </span>
            <button
              className={btn}
              disabled={pageIndex >= pageCount - 1}
              onClick={() => setPage(pageIndex + 1)}
            >
              Next
            </button>
          </div>
        )}
      </main>

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
      <Modal
        open={dialog === "classes"}
        onClose={() => setDialog(null)}
        width="max-w-3xl"
      >
        <h2 className="mb-4 text-lg font-semibold">Classes and sources</h2>
        <SummaryPanel
          datasetName={name}
          onChanged={refresh}
          reloadToken={detail}
        />
      </Modal>
      <Modal
        open={dialog === "model"}
        onClose={() => setDialog(null)}
        width="max-w-4xl"
      >
        <h2 className="mb-4 text-lg font-semibold">Model</h2>
        <TrainingPanel
          busy={busy}
          report={modelReport}
          runs={modelRuns}
          onTrain={() => setDialog("train")}
          onExport={() =>
            api
              .exportModel(name)
              .catch((e) =>
                notify(
                  e instanceof ApiError
                    ? e.message
                    : "Could not export the model",
                  "error",
                ),
              )
          }
        />
      </Modal>
      <GenerateDialog
        open={dialog === "generate"}
        classes={detail.subjects}
        items={items}
        onClose={() => setDialog(null)}
        onStart={(body) => runJob(() => api.generate(name, body))}
      />
      {dialog === "add" && (
        <AddImagesDialog
          classes={detail.subjects}
          initial={dropped}
          onClose={() => setDialog(null)}
          onStart={(uploads, target) =>
            runJob(() => api.upload(name, uploads, target))
          }
        />
      )}
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

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={`h-8 rounded-full border px-3 whitespace-nowrap ${
        on
          ? "border-text bg-text text-card"
          : "border-border bg-card hover:bg-subtle"
      }`}
    >
      {children}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  warn = false,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
  warn?: boolean;
}) {
  return (
    <label
      className={`flex h-9 items-center gap-1.5 rounded-md border pl-2.5 ${
        warn
          ? "border-warn-line bg-warn-soft text-warn"
          : "border-border bg-card"
      }`}
    >
      <span className={warn ? "" : "text-muted"}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 bg-transparent pr-1 outline-none ${value ? "font-semibold" : ""}`}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

type GridProps = {
  classes: string[];
  selected: Set<string>;
  selectMode: boolean;
  cardWidth: number;
  onToggle: (id: string) => void;
  onSetSelected: (id: string, on: boolean) => void;
  onOpen: (item: Item) => void;
  onDelete: (id: string) => void;
  onRelabel: (id: string, label: string) => void;
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
        <div key={row[0].id} className="border-border rounded-lg border p-2">
          <ImageGrid items={row} {...grid} />
        </div>
      ))}
    </div>
  );
}

function ImageGrid({
  items,
  classes,
  selected,
  selectMode,
  cardWidth,
  onToggle,
  onSetSelected,
  onOpen,
  onDelete,
  onRelabel,
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
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="min-w-0"
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
            classes={classes}
            selected={selected.has(item.id)}
            selectMode={selectMode}
            onToggle={onToggle}
            onOpen={onOpen}
            onDelete={onDelete}
            onRelabel={onRelabel}
          />
        </div>
      ))}
    </div>
  );
}
