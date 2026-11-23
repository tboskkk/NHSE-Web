/** Sprite-pack import (NHSE `img` naming: NNNNN_V.png) and its IndexedDB store. Packs never leave the browser. */
const NAME = /^(\d{1,5})_(\d{1,5})\.png$/i;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

export function parsePackName(name: string): { id: number; variant: number } | null {
  const m = NAME.exec(name.split(/[\\/]/).pop() ?? "");
  return m ? { id: Number(m[1]), variant: Number(m[2]) } : null;
}

/** Keys are `${id}_${variant}`. Bad names, non-PNG data and duplicates (first wins) are skipped and counted. */
export function importPack(files: { name: string; data: Uint8Array }[]): { entries: Map<string, Uint8Array>; skipped: number } {
  const entries = new Map<string, Uint8Array>();
  let skipped = 0;
  for (const f of files) {
    const p = parsePackName(f.name);
    const key = p && `${p.id}_${p.variant}`;
    if (!key || !PNG_MAGIC.every((b, i) => f.data[i] === b) || entries.has(key)) {
      skipped++;
      continue;
    }
    entries.set(key, f.data);
  }
  return { entries, skipped };
}

export interface PackStore {
  save(entries: Map<string, Uint8Array>): Promise<void>;
  load(): Promise<Map<string, Uint8Array>>;
  clear(): Promise<void>;
}

const DB = "nhse-web";
const STORE = "sprites";

/** IndexedDB-backed store; any IndexedDB failure degrades to an in-memory copy for this session. */
export function createPackStore(idb: IDBFactory | undefined = globalThis.indexedDB, key = "pack"): PackStore {
  let memory = new Map<string, Uint8Array>();
  let broken = idb === undefined;

  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb!.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  };

  return {
    async save(entries) {
      memory = new Map(entries);
      if (broken) return;
      try {
        await run("readwrite", (s) => s.put(entries, key));
      } catch {
        broken = true;
      }
    },
    async load() {
      if (!broken) {
        try {
          const v = await run<Map<string, Uint8Array> | undefined>("readonly", (s) => s.get(key));
          if (v) memory = v;
        } catch {
          broken = true;
        }
      }
      return new Map(memory);
    },
    async clear() {
      memory = new Map();
      if (broken) return;
      try {
        await run("readwrite", (s) => s.delete(key));
      } catch {
        broken = true;
      }
    },
  };
}

export const packStore: PackStore = createPackStore();
