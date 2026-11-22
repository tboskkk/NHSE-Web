import { SaveLoadError, type SaveFiles } from "@nhse/core";
import { findSaveRoot } from "./saveRoot";
import { fromZip } from "./zip";

export { findSaveRoot } from "./saveRoot";
export { fromZip, toZip } from "./zip";
export { supportsFsAccess, openFolder, writeFiles } from "./fsAccess";
export { downloadBytes, backupName, saveZipName } from "./download";

const bytes = async (f: File) => new Uint8Array(await f.arrayBuffer());

/** Folder upload (`webkitRelativePath`) or a single .zip; result is rooted at the save folder. */
export async function fromFileList(files: FileList | File[]): Promise<SaveFiles> {
  const list = Array.from(files);
  if (list.length === 1 && /\.zip$/i.test(list[0]!.name)) return findSaveRoot(await fromZip(await bytes(list[0]!)));
  if (list.length === 0) throw new SaveLoadError("missing-main", "No files were selected.");
  const raw = new Map<string, Uint8Array>();
  for (const f of list) raw.set((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, await bytes(f));
  return findSaveRoot(raw);
}

type Entry = { isFile: boolean; isDirectory: boolean; name: string; file?: (cb: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries(cb: (e: Entry[]) => void, err: (e: unknown) => void): void } };

async function walk(entry: Entry, prefix: string, out: Map<string, Uint8Array>): Promise<void> {
  if (entry.isFile) {
    const f = await new Promise<File>((res, rej) => entry.file!(res, rej));
    out.set(prefix + entry.name, await bytes(f));
  } else if (entry.isDirectory) {
    const reader = entry.createReader!();
    for (;;) {
      const batch = await new Promise<Entry[]>((res, rej) => reader.readEntries(res, rej));
      if (batch.length === 0) break; // readEntries returns chunks until empty
      for (const e of batch) await walk(e, `${prefix}${entry.name}/`, out);
    }
  }
}

/** Drag-and-drop of a folder (recursive webkitGetAsEntry) or a .zip. */
export async function fromDataTransfer(dt: DataTransfer): Promise<SaveFiles> {
  const entries = Array.from(dt.items)
    .map((i) => i.webkitGetAsEntry() as unknown as Entry | null)
    .filter((e): e is Entry => e !== null);
  const onlyZip = entries.length === 1 && entries[0]!.isFile && /\.zip$/i.test(entries[0]!.name);
  if (onlyZip || entries.length === 0) return fromFileList(dt.files);
  const raw = new Map<string, Uint8Array>();
  for (const e of entries) await walk(e, "", raw);
  return findSaveRoot(raw);
}
