/**
 * Object URLs for images stored in OPFS, standing in for the desktop /media route
 *
 * A URL is reused while the file is unchanged. An edited file gets a fresh URL, so
 * the grid reloads its pixels without a cache-busting query (blob URLs reject one)
 * Old URLs are revoked after a delay, a card can still be showing one until the
 * next refresh hands it the new URL
 */

import { readFile } from "./fs";

const REVOKE_DELAY_MS = 60_000;

const cache = new Map<string, { url: string; stamp: number; size: number }>();

function retire(url: string) {
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export async function fileUrl(path: string): Promise<string> {
  const file = await readFile(path);
  if (!file) {
    forget(path);
    return "";
  }
  const hit = cache.get(path);
  if (hit && hit.stamp === file.lastModified && hit.size === file.size) {
    return hit.url;
  }
  if (hit) retire(hit.url);
  const url = URL.createObjectURL(file);
  cache.set(path, { url, stamp: file.lastModified, size: file.size });
  return url;
}

/** Drop a path's cached URL after its file was rewritten, moved, or deleted */
export function forget(path: string): void {
  const hit = cache.get(path);
  if (!hit) return;
  cache.delete(path);
  retire(hit.url);
}
