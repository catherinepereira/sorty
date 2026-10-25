/**
 * Slugs and item ids, matching sorty/core/ids.py and DatasetItem.make_id so a
 * manifest moves between the desktop app and the browser without id changes
 */

export const FALLBACK_SLUG = "unlabeled";

// reserved on Windows as device names, kept so slugs stay valid folder names there
const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

export function slugify(text: string): string {
  // drop everything past ASCII, surrogate halves included
  let s = text.normalize("NFKD").replace(/[\u0080-￿]/g, "");
  s = s.toLowerCase().trim();
  s = s.replace(/[^a-z0-9\s-]/g, "");
  s = s.replace(/[\s_]+/g, "-").replace(/^-+|-+$/g, "");
  s = s.slice(0, 80);
  if (!s || WINDOWS_RESERVED.has(s)) return FALLBACK_SLUG;
  return s;
}

const ID_LENGTH = 12;

/** A stable id from a source URL or, for manual images, the local path */
export async function makeId(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(key),
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, ID_LENGTH);
}
