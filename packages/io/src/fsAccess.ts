import type { SaveFiles } from "@nhse/core";
import { findSaveRoot } from "./saveRoot";

type PickerWindow = Window & { showDirectoryPicker?: (o?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> };
type IterableDir = FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };

export function supportsFsAccess(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

async function readTree(dir: FileSystemDirectoryHandle, prefix: string, out: Map<string, Uint8Array>): Promise<void> {
  for await (const [name, h] of (dir as IterableDir).entries()) {
    if (h.kind === "directory") await readTree(h as FileSystemDirectoryHandle, `${prefix}${name}/`, out);
    else out.set(prefix + name, new Uint8Array(await (await (h as FileSystemFileHandle).getFile()).arrayBuffer()));
  }
}

/** Walks `handle` down `path` (directories only). */
async function descend(handle: FileSystemDirectoryHandle, path: string[]): Promise<FileSystemDirectoryHandle> {
  let h = handle;
  for (const part of path) h = await h.getDirectoryHandle(part);
  return h;
}

export async function openFolder(): Promise<{ handle: FileSystemDirectoryHandle; files: SaveFiles }> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("This browser cannot open folders in place.");
  const top = await picker.call(window, { mode: "readwrite" });
  const raw = new Map<string, Uint8Array>();
  await readTree(top, "", raw);
  const files = findSaveRoot(raw);
  // Keep the sub-handle of the save root so writes land next to main.dat.
  const rootKey = [...raw.keys()].find((k) => k.endsWith("main.dat") && files.has("main.dat") && raw.get(k) === files.get("main.dat"))!;
  const handle = await descend(top, rootKey.split("/").slice(0, -1));
  return { handle, files };
}

/** Writes only the given keys (e.g. "main.dat", "Villager0/personal.dat") under `root`. */
export async function writeFiles(root: FileSystemDirectoryHandle, files: SaveFiles): Promise<void> {
  for (const [key, bytes] of files) {
    const parts = key.split("/");
    const dir = await (async () => {
      let h = root;
      for (const p of parts.slice(0, -1)) h = await h.getDirectoryHandle(p, { create: true });
      return h;
    })();
    const fh = await dir.getFileHandle(parts[parts.length - 1]!, { create: true });
    const w = await fh.createWritable();
    await w.write(bytes as BufferSource);
    await w.close();
  }
}
