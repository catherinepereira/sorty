import type {
  DatasetDetail,
  DatasetSummary,
  DatasetSummaryStats,
  Item,
  JobState,
  Status,
} from "./types";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // response had no JSON body, keep the status text
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  return req<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const post = <T>(path: string, body?: unknown) => send<T>("POST", path, body);

export { ApiError };

export const api = {
  sources: () =>
    req<{
      sources: { name: string; requires_contact: boolean }[];
      contact_set: boolean;
    }>("/api/sources"),
  setContact: (email: string) =>
    post<{ contact_set: boolean }>("/api/contact", { email }),

  listDatasets: () =>
    req<{ datasets: DatasetSummary[] }>("/api/datasets").then(
      (r) => r.datasets,
    ),
  createDataset: (name: string) =>
    post<{ name: string }>("/api/datasets", { name }),
  getDataset: (name: string) => req<DatasetDetail>(`/api/datasets/${name}`),
  renameDataset: (name: string, newName: string) =>
    send<{ name: string }>("PATCH", `/api/datasets/${name}`, { name: newName }),
  deleteDataset: (name: string) =>
    send<{ deleted: boolean }>("DELETE", `/api/datasets/${name}`),
  getBin: (name: string) =>
    req<{ items: Item[] }>(`/api/datasets/${name}/bin`).then((r) => r.items),
  getSummary: (name: string) =>
    req<DatasetSummaryStats>(`/api/datasets/${name}/summary`),
  deleteClass: (name: string, className: string) =>
    post<{ removed: number }>(`/api/datasets/${name}/delete-class`, {
      class_name: className,
    }),
  renameClass: (name: string, oldName: string, newName: string) =>
    post<{ moved: number }>(`/api/datasets/${name}/rename-class`, {
      old_name: oldName,
      new_name: newName,
    }),
  mergeClasses: (name: string, sources: string[], target: string) =>
    post<{ moved: number }>(`/api/datasets/${name}/merge-classes`, {
      sources,
      target,
    }),
  getItem: (name: string, id: string) =>
    req<
      Item & {
        width: number | null;
        height: number | null;
        bytes: number | null;
        ingested: number | null;
      }
    >(`/api/datasets/${name}/items/${id}`),

  setLabel: (name: string, id: string, subject: string) =>
    post<{ item: Item }>(`/api/datasets/${name}/items/${id}/label`, {
      subject,
    }),
  duplicateItem: (name: string, id: string) =>
    post<{ item: Item }>(`/api/datasets/${name}/items/${id}/duplicate`),
  cropItem: (
    name: string,
    id: string,
    box: { left: number; top: number; width: number; height: number },
  ) =>
    post<{
      item: Item & {
        width: number | null;
        height: number | null;
        bytes: number | null;
        ingested: number | null;
      };
    }>(`/api/datasets/${name}/items/${id}/crop`, box),
  setStatus: (name: string, id: string, status: Status) =>
    post<{ item: Item }>(`/api/datasets/${name}/items/${id}/status`, {
      status,
    }),
  moveToClass: (name: string, ids: string[], subject: string) =>
    post<{ moved: number }>(`/api/datasets/${name}/move-to-class`, {
      item_ids: ids,
      subject,
    }),
  setStatusMany: (name: string, ids: string[], status: Status) =>
    post<{ changed: number }>(`/api/datasets/${name}/set-status`, {
      item_ids: ids,
      status,
    }),

  del: (name: string, ids: string[]) =>
    post<{ binned: number }>(`/api/datasets/${name}/delete`, { item_ids: ids }),
  restore: (name: string, ids: string[]) =>
    post<{ restored: number }>(`/api/datasets/${name}/restore`, {
      item_ids: ids,
    }),
  emptyBin: (name: string) =>
    post<{ removed: number }>(`/api/datasets/${name}/empty-bin`),

  generate: (
    name: string,
    body: {
      subjects?: string[];
      prompt?: string;
      class_count?: number;
      sources: string[];
      count: number;
      target_total: boolean;
    },
  ) => post<{ job_id: string }>(`/api/datasets/${name}/generate`, body),
  dedup: (name: string) =>
    post<{ job_id: string }>(`/api/datasets/${name}/dedup`),
  train: (name: string) =>
    post<{ job_id: string }>(`/api/datasets/${name}/train`, {}),

  setSubjects: (name: string, subjects: string[]) =>
    post<{ subjects: string[] }>(`/api/datasets/${name}/subjects`, {
      subjects,
    }),
  resolveSubjects: (
    name: string,
    body: { prompt: string; count?: number; exclude?: string[] },
  ) =>
    post<{ subjects: string[] }>(
      `/api/datasets/${name}/resolve-subjects`,
      body,
    ),
  deleteSource: (name: string, source: string) =>
    post<{ binned: number }>(`/api/datasets/${name}/delete-source`, { source }),
  refresh: (name: string) =>
    post<{ added: number; pruned: number }>(`/api/datasets/${name}/refresh`),

  job: (id: string) => req<JobState>(`/api/jobs/${id}`),
};
