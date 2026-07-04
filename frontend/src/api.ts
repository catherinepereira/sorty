import type {
  DatasetDetail,
  DatasetSummary,
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

function post<T>(path: string, body?: unknown): Promise<T> {
  return req<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export { ApiError };

export const api = {
  sources: () => req<{ sources: string[] }>("/api/sources"),
  models: () => req<{ models: string[] }>("/api/models"),
  torch: () => req<{ available: boolean }>("/api/torch"),

  listDatasets: () =>
    req<{ datasets: DatasetSummary[] }>("/api/datasets").then(
      (r) => r.datasets,
    ),
  createDataset: (name: string, prompt: string) =>
    post<{ name: string }>("/api/datasets", { name, prompt }),
  getDataset: (name: string) => req<DatasetDetail>(`/api/datasets/${name}`),
  getBin: (name: string) =>
    req<{ items: Item[] }>(`/api/datasets/${name}/bin`).then((r) => r.items),

  setLabel: (name: string, id: string, subject: string) =>
    post<{ item: Item }>(`/api/datasets/${name}/items/${id}/label`, {
      subject,
    }),
  setStatus: (name: string, id: string, status: Status) =>
    post<{ item: Item }>(`/api/datasets/${name}/items/${id}/status`, {
      status,
    }),
  setNote: (name: string, id: string, note: string) =>
    post<{ item: Item }>(`/api/datasets/${name}/items/${id}/note`, { note }),

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
      count?: number;
      sources: string[];
      limit: number;
    },
  ) => post<{ job_id: string }>(`/api/datasets/${name}/generate`, body),
  dedup: (name: string, mode: "exact" | "outliers") =>
    post<{ job_id: string }>(`/api/datasets/${name}/dedup`, { mode }),
  train: (name: string, model: string, epochs: number) =>
    post<{ job_id: string }>(`/api/datasets/${name}/train`, { model, epochs }),
  infer: (name: string) =>
    post<{ job_id: string }>(`/api/datasets/${name}/infer`),

  job: (id: string) => req<JobState>(`/api/jobs/${id}`),
};
