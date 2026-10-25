/**
 * Path-based helpers over the origin private file system (OPFS)
 *
 * Paths are "/"-separated and relative to the OPFS root, mirroring the desktop
 * layout (datasets/<name>/<label>/<file>)
 * Directory handles are cached by path, an uncached lookup walks from the root one segment at a time
 */

let rootHandle: Promise<FileSystemDirectoryHandle> | null = null;
const dirCache = new Map<string, FileSystemDirectoryHandle>();

function root(): Promise<FileSystemDirectoryHandle> {
  return (rootHandle ??= navigator.storage.getDirectory());
}

export function split(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function join(...parts: string[]): string {
  return parts.flatMap(split).join("/");
}

export function parent(path: string): string {
  return split(path).slice(0, -1).join("/");
}

export function basename(path: string): string {
  const parts = split(path);
  return parts[parts.length - 1] ?? "";
}

function isNotFound(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "NotFoundError" || e.name === "TypeMismatchError")
  );
}

export async function getDir(
  path: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  const key = split(path).join("/");
  const cached = dirCache.get(key);
  if (cached) return cached;
  let dir = await root();
  for (const name of split(path)) {
    dir = await dir.getDirectoryHandle(name, { create });
  }
  dirCache.set(key, dir);
  return dir;
}

export async function tryDir(
  path: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await getDir(path);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function fileHandle(
  path: string,
  create: boolean,
): Promise<FileSystemFileHandle> {
  const dir = await getDir(parent(path), create);
  return dir.getFileHandle(basename(path), { create });
}

export async function readFile(path: string): Promise<File | null> {
  try {
    return await (await fileHandle(path, false)).getFile();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function readText(path: string): Promise<string | null> {
  const file = await readFile(path);
  return file ? file.text() : null;
}

export async function exists(path: string): Promise<boolean> {
  return (await readFile(path)) !== null;
}

export async function writeFile(
  path: string,
  data: Blob | BufferSource | string,
): Promise<void> {
  const handle = await fileHandle(path, true);
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function mkdirs(path: string): Promise<void> {
  await getDir(path, true);
}

/** Remove a file or directory, a missing path is not an error */
export async function remove(path: string): Promise<void> {
  const dir = await tryDir(parent(path));
  if (!dir) return;
  try {
    await dir.removeEntry(basename(path), { recursive: true });
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
  const key = split(path).join("/");
  for (const cached of [...dirCache.keys()]) {
    if (cached === key || cached.startsWith(key + "/")) dirCache.delete(cached);
  }
}

/** Move a file, overwriting the destination. Returns false when the source is missing */
export async function moveFile(from: string, to: string): Promise<boolean> {
  if (join(from) === join(to)) return true;
  const file = await readFile(from);
  if (!file) return false;
  await writeFile(to, file);
  await remove(from);
  return true;
}

export async function copyFile(from: string, to: string): Promise<boolean> {
  const file = await readFile(from);
  if (!file) return false;
  await writeFile(to, file);
  return true;
}

export async function listDir(
  path: string,
): Promise<{ name: string; kind: "file" | "directory" }[]> {
  const dir = await tryDir(path);
  if (!dir) return [];
  const out: { name: string; kind: "file" | "directory" }[] = [];
  for await (const handle of dir.values()) {
    out.push({ name: handle.name, kind: handle.kind });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every file path under a directory, relative to it, sorted */
export async function walkFiles(path: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (rel: string) => {
    for (const entry of await listDir(join(path, rel))) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.kind === "directory") await visit(child);
      else out.push(child);
    }
  };
  await visit("");
  return out.sort();
}

/** Copy a directory tree, used for dataset rename since OPFS has no portable dir move */
export async function copyDir(from: string, to: string): Promise<void> {
  await mkdirs(to);
  for (const rel of await walkFiles(from)) {
    await copyFile(join(from, rel), join(to, rel));
  }
}
