import type { Upload } from "./api";

/**
 * Files from a drop, walking into dropped folders. Must be called synchronously
 * from the drop handler, the browser clears dataTransfer once the event returns
 */
export function collectDropped(dt: DataTransfer): Promise<Upload[]> {
  const entries = [...dt.items]
    .map((item) => item.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);
  return walkEntries(entries);
}

async function walkEntries(entries: FileSystemEntry[]): Promise<Upload[]> {
  const out: Upload[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string) => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      out.push({ path: prefix + file.name, file });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns at most 100 entries per call, read until it comes back empty
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const entry of entries) await walk(entry, "");
  return out;
}

/** Files from an <input type="file">, keeping folder paths from a directory picker */
export function collectPicked(files: FileList): Upload[] {
  return [...files].map((file) => ({
    path: file.webkitRelativePath || file.name,
    file,
  }));
}
