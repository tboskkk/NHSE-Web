import type { MapView, Structures, Touched } from "../worker/protocol";

export interface MapStore {
  readonly map: MapView;
  readonly version: number;
  /** Writes edited/undone/redone tiles into the held map in place; throws before changing anything if an index is out of range. */
  patch(touched: Touched[]): void;
  /** Replaces the held buildings and plaza in place (same array object); throws before changing anything if the building count is wrong. */
  patchStructures(s: Structures): void;
  subscribe(cb: (version: number) => void): () => void;
}

/** Holds the viewer's map copy and patches it in place after map edits, so layers are never re-transferred. */
export function createMapStore(initial: MapView): MapStore {
  let version = 0;
  const listeners = new Set<(v: number) => void>();
  return {
    map: initial,
    get version() {
      return version;
    },
    patch(touched) {
      for (const t of touched) {
        const l = initial.items[t.layer];
        if (!Number.isInteger(t.index) || t.index < 0 || t.index >= l.raw.length) throw new RangeError(`tile index ${t.index} is outside the item layer`);
      }
      if (touched.length === 0) return;
      for (const t of touched) initial.items[t.layer].raw[t.index] = BigInt(`0x${t.raw}`);
      version++;
      for (const cb of listeners) cb(version);
    },
    patchStructures(s) {
      if (s.buildings.length !== initial.buildings.length) throw new RangeError(`expected ${initial.buildings.length} buildings, got ${s.buildings.length}`);
      for (let i = 0; i < s.buildings.length; i++) initial.buildings[i] = { ...s.buildings[i]! };
      initial.plaza = { x: s.plaza.x, z: s.plaza.z };
      version++;
      for (const cb of listeners) cb(version);
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
