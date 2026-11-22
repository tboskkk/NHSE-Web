import { SaveLoadError, type EditOp } from "@nhse/core";
import {
  backupName, downloadBytes, fromDataTransfer, fromFileList, openFolder as pickFolder, saveZipName,
  supportsFsAccess, toZip, writeFiles,
} from "@nhse/io";
import { createClient } from "./api";
import type { LoadResult } from "../worker/protocol";

export type Section = "player" | "villagers" | "map" | "collections" | "island";

export const api = createClient();

export const app = $state({
  loaded: null as LoadResult | null,
  section: "player" as Section,
  playerIndex: 0,
  history: [] as string[],
  advanced: false,
  folder: null as FileSystemDirectoryHandle | null,
  backedUp: false,
  /** Bumped after every mutation so views know to refetch. */
  rev: 0,
  lang: "en",
  busy: false,
  error: null as string | null,
  toast: null as string | null,
  hashWarningDismissed: false,
  /** Redo stack depth, tracked here so the button can disable. */
  redoable: 0,
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string) {
  app.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (app.toast = null), 4000);
}

export const canSaveInPlace = () => app.folder !== null && supportsFsAccess();
export { supportsFsAccess };

async function load(getFiles: () => Promise<{ files: Map<string, Uint8Array>; folder?: FileSystemDirectoryHandle }>) {
  app.error = null;
  app.busy = true;
  try {
    const { files, folder } = await getFiles();
    const result = await api.load(files, app.lang);
    app.loaded = result;
    app.folder = folder ?? null;
    app.history = [];
    app.redoable = 0;
    app.backedUp = false;
    app.playerIndex = 0;
    app.section = "player";
    app.hashWarningDismissed = false;
    app.rev++;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return; // picker cancelled
    app.error = e instanceof SaveLoadError ? e.detail : e instanceof Error ? e.message.replace(/^[a-z-]+: /, "") : String(e);
  } finally {
    app.busy = false;
  }
}

export const openFolder = () => load(async () => pickFolder().then((r) => ({ files: r.files, folder: r.handle })));
export const openFiles = (files: FileList | File[]) => load(async () => ({ files: await fromFileList(files) }));
export const openDrop = (dt: DataTransfer) => load(async () => ({ files: await fromDataTransfer(dt) }));

/** Applies an edit op through the worker; the single entry point for UI edits. */
export async function edit(op: EditOp) {
  try {
    const r = await api.edit(op);
    app.history = r.history;
    app.redoable = 0;
    app.rev++;
    return r.change;
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function undo() {
  if (!app.history.length) return;
  if (await api.undo()) {
    app.history = app.history.slice(0, -1);
    app.redoable++;
    app.rev++;
  }
}

export async function redo() {
  const label = await api.redo();
  if (label) {
    app.history = [...app.history, label];
    app.redoable = Math.max(0, app.redoable - 1);
    app.rev++;
  }
}

export async function saveInPlace() {
  if (!app.loaded || !app.folder) return;
  try {
    if (!app.backedUp) {
      downloadBytes(toZip(await api.originals(), app.loaded.island), backupName(app.loaded.island, new Date()));
      app.backedUp = true;
    }
    const files = await api.build("changed");
    await writeFiles(app.folder, files);
    showToast(files.size === 0 ? "Nothing to save" : `Saved ${files.size} files`);
  } catch (e) {
    showToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function saveZip() {
  if (!app.loaded) return;
  try {
    downloadBytes(toZip(await api.build("all"), app.loaded.island), saveZipName(app.loaded.island, new Date()));
  } catch (e) {
    showToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export const save = () => (canSaveInPlace() ? saveInPlace() : saveZip());
