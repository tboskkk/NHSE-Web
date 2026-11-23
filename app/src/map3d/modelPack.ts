import { createPackStore } from "../map/spritePack";
import { decodeGeometry, type Geometry, parseManifest } from "./modelFormat";

export type LoadedModels = {
  items: Map<number, string>;
  /** `textures` (terrain pieces) holds one PNG per material group, in group order; `texture` is the first. */
  models: Map<string, { geometry: Geometry; texture: Uint8Array /* PNG */; textures?: Uint8Array[] }>;
  /** Terrain pieces: `"<unitId>_<variation>"` -> model key (only pieces that loaded). */
  terrain: Map<string, string>;
};
type PackFile = { name: string; data: Uint8Array };

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const basename = (p: string) => p.split(/[\\/]/).pop() ?? "";
const norm = (p: string) => p.replace(/\\/g, "/");

/** True when the files include a model pack manifest (`models.json`, at any folder depth). */
export function isModelPack(files: PackFile[]): boolean {
  return files.some((f) => basename(f.name).toLowerCase() === "models.json");
}

/**
 * Parses a model pack imported as a folder or zip. A model whose geometry or texture is missing or corrupt is skipped
 * (counted); items that point at a skipped model are dropped so they keep their sprites.
 */
export function parseModelPack(files: PackFile[]): LoadedModels & { skipped: number } {
  const mf = files.find((f) => basename(f.name).toLowerCase() === "models.json");
  if (!mf) throw new Error("not a model pack: no models.json");
  const manifest = parseManifest(new TextDecoder().decode(mf.data));
  const prefix = norm(mf.name).slice(0, norm(mf.name).length - "models.json".length);
  const byPath = new Map(files.map((f) => [norm(f.name), f.data]));
  const find = (rel: string) => byPath.get(prefix + rel) ?? [...byPath].find(([n]) => n.endsWith(`/${rel}`))?.[1];

  const models: LoadedModels["models"] = new Map();
  let skipped = 0;
  for (const [key, e] of Object.entries(manifest.models)) {
    try {
      const g = find(e.geometry);
      if (!g) throw new Error("geometry file missing");
      const png = (rel: string) => {
        const t = find(rel);
        if (!t || !PNG_MAGIC.every((b, i) => t[i] === b)) throw new Error("texture missing or not a PNG");
        return t;
      };
      if (e.textures) {
        const textures = e.textures.map(png);
        models.set(key, { geometry: decodeGeometry(g), texture: textures[0]!, textures });
      } else models.set(key, { geometry: decodeGeometry(g), texture: png(e.texture) });
    } catch {
      skipped++;
    }
  }
  const items = new Map<number, string>();
  for (const [id, key] of Object.entries(manifest.items)) if (models.has(key)) items.set(Number(id), key);
  const terrain = new Map<string, string>();
  for (const [k, key] of Object.entries(manifest.terrain ?? {})) if (models.has(key)) terrain.set(k, key);
  return { items, models, terrain, skipped };
}

/** The raw pack files, kept in IndexedDB beside the sprite pack (own key); an IndexedDB failure degrades to memory. */
export const modelPackStore = createPackStore(globalThis.indexedDB, "models");
