export type Status = "pending" | "valid" | "invalid";

export interface Item {
  id: string;
  label: string;
  subject: string;
  status: Status;
  note: string;
  url: string;
  binned: boolean;
  source: string;
  source_url: string;
  title: string;
  local_path: string;
  directory: string;
  filename: string;
}

export interface DatasetSummary {
  name: string;
  total: number;
  valid: number;
  pending: number;
  subjects: number;
  thumbnail: string;
}

export interface DatasetDetail {
  name: string;
  prompt: string;
  subjects: string[];
  sources: string[];
  stats: { total: number; pending: number; valid: number; invalid: number };
  items: Item[];
}

export interface Prediction {
  id: string;
  label: string;
  subject: string;
  predicted: string;
  url: string;
}

export type JobState =
  | { id: string; status: "running"; progress: JobProgress }
  | { id: string; status: "done"; progress: JobProgress; result: unknown }
  | { id: string; status: "error"; progress: JobProgress; error: string };

export interface JobProgress {
  total: number;
  done: number;
  message: string;
}

export interface GenerateResult {
  records: number;
  added: number;
  saved: number;
  failed: number;
  dropped: number;
}

export interface DatasetSummaryStats {
  total: number;
  subjects: number;
  per_class: { name: string; count: number }[];
  per_source: { name: string; count: number }[];
  bytes_total: number;
  image_sizes: {
    measured: number;
    min_width: number;
    max_width: number;
    min_height: number;
    max_height: number;
    mean_width: number;
    mean_height: number;
  } | null;
}
