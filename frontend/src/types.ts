export type Status = "pending" | "valid" | "invalid";

// one detection box in COCO pixel coordinates (top-left corner plus extents), with its class slug
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface Item {
  id: string;
  // class slug (e.g. "boat-pose"), prettified for display via prettyClass
  label: string;
  status: Status;
  url: string;
  binned: boolean;
  source: string;
  source_url: string;
  title: string;
  local_path: string;
  directory: string;
  filename: string;
  // the cross-validated model's class for this image, null until a model has run
  predicted: string | null;
  // which split the image sits in ("train" | "test" | "valid"), null for flat class folders
  split: string | null;
  // detection boxes in COCO pixel coordinates, empty for images with none
  boxes: Box[];
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
  locks: { splits: boolean; review: boolean };
  items: Item[];
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

export interface DatasetSummaryStats {
  total: number;
  subjects: number;
  per_class: { name: string; count: number }[];
  per_source: { name: string; count: number }[];
  bytes_total: number;
}
