import { SaveLoadError, type EditOp } from "@nhse/core";
import {
  backupName, downloadBytes, fromDataTransfer, fromFileList, openFolder as pickFolder, saveZipName,
  supportsFsAccess, toZip, writeFiles,
} from "@nhse/io";
import { createClient } from "./api";
import type { LoadResult, Structures, Touched } from "../worker/protocol";

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
  /** history.length at the last successful save (in place or zip): the rest are unsaved. */
  savedCount: 0,
});

export const unsavedCount = () => Math.max(0, app.history.length - app.savedCount);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string) {
  app.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (app.toast = null), 4000);
}

export const canSaveInPlace = () => app.folder !== null && supportsFsAccess();
export { supportsFsAccess };

async function load(getFiles: () => Promise<{ files: Map<string, Uint8Array>; folder?: FileSystemDirectoryHandle }>) {
  if (app.loaded && unsavedCount() > 0 && !confirm(`You have ${unsavedCount()} unsaved change(s). Open a different save and discard them?`)) return;
  app.error = null;
  app.busy = true;
  try {
    const { files, folder } = await getFiles();
    const result = await api.load(files, app.lang);
    app.loaded = result;
    app.folder = folder ?? null;
    app.history = [];
    app.savedCount = 0;
    app.redoable = 0;
    app.backedUp = false;
    app.playerIndex = 0;
    app.section = "player";
    app.hashWarningDismissed = false;
    app.rev++;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return; // picker cancelled
    const msg = e instanceof SaveLoadError ? e.detail : e instanceof Error ? e.message.replace(/^[a-z-]+: /, "") : String(e);
    if (app.loaded) showToast(`Could not open that save: ${msg} (your open save is unchanged)`);
    else app.error = msg;
  } finally {
    app.busy = false;
  }
}

export const openFolder = () => load(async () => pickFolder().then((r) => ({ files: r.files, folder: r.handle })));
export const openFiles = (files: FileList | File[]) => load(async () => ({ files: await fromFileList(files) }));
export const openDrop = (dt: DataTransfer) => load(async () => ({ files: await fromDataTransfer(dt) }));

/** The in-flight save, if any. Saves never overlap, and edits wait for it so a save sees a stable snapshot. */
let saving: Promise<void> | null = null;

async function refreshSummary() {
  const s = await api.summary();
  if (app.loaded) app.loaded = { ...app.loaded, island: s.island, players: s.players };
}

/** Edits that have started but not finished, so Save can wait for a field that just committed. */
const pending = new Set<Promise<unknown>>();
const track = <T>(p: Promise<T>): Promise<T> => {
  pending.add(p);
  return p.finally(() => pending.delete(p));
};

const mapTouchedListeners = new Set<(t: Touched[]) => void>();
/** Registers a listener for item layer tiles changed by an edit, undo or redo; returns an unsubscribe function. */
export function onMapTouched(cb: (t: Touched[]) => void): () => void {
  mapTouchedListeners.add(cb);
  return () => mapTouchedListeners.delete(cb);
}
const emitTouched = (t: Touched[]) => { if (t.length) for (const cb of mapTouchedListeners) cb(t); };

const structuresListeners = new Set<(s: Structures) => void>();
/** Registers a listener for buildings/plaza changed by an edit, undo or redo; returns an unsubscribe function. */
export function onStructuresTouched(cb: (s: Structures) => void): () => void {
  structuresListeners.add(cb);
  return () => structuresListeners.delete(cb);
}
const emitStructures = (s: Structures | null) => { if (s) for (const cb of structuresListeners) cb(s); };

/** Applies an edit op through the worker; the single entry point for UI edits. */
export const edit = (op: EditOp) => track(doEdit(op));

async function doEdit(op: EditOp) {
  await saving;
  try {
    const r = await api.edit(op);
    app.history = r.history;
    app.redoable = 0;
    emitTouched(r.touched);
    emitStructures(r.structures);
    await refreshSummary();
    app.rev++;
    return r.change;
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function undo() {
  await saving;
  if (!app.history.length) return;
  const u = await api.undo();
  if (u.label) {
    emitTouched(u.touched);
    emitStructures(u.structures);
    app.history = app.history.slice(0, -1);
    app.savedCount = Math.min(app.savedCount, app.history.length);
    app.redoable++;
    await refreshSummary();
    app.rev++;
  }
}

export async function redo() {
  await saving;
  const r = await api.redo();
  if (r.label) {
    emitTouched(r.touched);
    emitStructures(r.structures);
    app.history = [...app.history, r.label];
    app.redoable = Math.max(0, app.redoable - 1);
    await refreshSummary();
    app.rev++;
  }
}

/** Runs one save at a time (key repeat, double clicks); a request while one is running is ignored. */
function exclusive(fn: () => Promise<void>): Promise<void> {
  if (saving) return saving;
  app.busy = true;
  const run = (async () => {
    while (pending.size) await Promise.allSettled([...pending]);
    await fn();
  })().finally(() => {
    saving = null;
    app.busy = false;
  });
  saving = run;
  return run;
}

export const saveInPlace = () =>
  exclusive(async () => {
    if (!app.loaded || !app.folder) return;
    try {
      if (!app.backedUp) {
        downloadBytes(toZip(await api.originals(), app.loaded.island), backupName(app.loaded.island, new Date()));
        app.backedUp = true;
      }
      const files = await api.build("changed");
      await writeFiles(app.folder, files);
      await api.commit(); // only after every file is written: a failed write stays pending for the retry
      app.savedCount = app.history.length;
      showToast(files.size === 0 ? "Nothing to save" : `Saved ${files.size} files`);
    } catch (e) {
      showToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

export const saveZip = () =>
  exclusive(async () => {
    if (!app.loaded) return;
    try {
      // A zip download is not an in-place write, so it does not reset the changed set.
      downloadBytes(toZip(await api.build("all"), app.loaded.island), saveZipName(app.loaded.island, new Date()));
      app.savedCount = app.history.length;
    } catch (e) {
      showToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

export const save = () => (canSaveInPlace() ? saveInPlace() : saveZip());
