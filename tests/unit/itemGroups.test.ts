import { expect, test } from "bun:test";
import { groupItems } from "../../app/src/map3d/itemGroups";
import { buildTileField } from "../../app/src/map3d/terrainMesh";
import type { SpriteRef, SpriteSource } from "../../app/src/map/spriteSource";
import { emptyMap, rawOf } from "./mapFixture";

const H = 192;
const put = (m: ReturnType<typeof emptyMap>, layer: 0 | 1, x: number, y: number, raw: bigint) => (m.items[layer].raw[H * x + y] = raw);
const field = (m: ReturnType<typeof emptyMap>) => buildTileField(m, new Uint8Array(318 * 256));
const src = (ref: SpriteRef): SpriteSource => ({ resolve: () => ref });
const CHAIR = 770; // 2x2 footprint

test("a pack sprite lies flat over its footprint centre", () => {
  const m = emptyMap();
  put(m, 0, 10, 12, rawOf(CHAIR));
  const g = groupItems(m, field(m), src({ kind: "pack", url: "p" }));
  expect(g.upright.size).toBe(0);
  const [i] = g.flat.get("p")!;
  expect(i).toMatchObject({ x: 11, z: 32 + 12 + 1, w: 2, h: 2 });
});

test("icons and the leaf stand upright, square, on the ground", () => {
  const m = emptyMap();
  put(m, 0, 10, 12, rawOf(CHAIR));
  put(m, 1, 20, 20, rawOf(1)); // 1x2 footprint
  const g = groupItems(m, field(m), src({ kind: "icon", url: "i" }));
  const all = g.upright.get("i")!;
  expect(all).toHaveLength(2);
  expect(all.find((a) => a.x === 11)).toMatchObject({ w: 2, h: 2 });
  expect(all.find((a) => a.x === 20.5)).toMatchObject({ w: 2, h: 2 }); // side = max(w,h)
});

test("an item with no sprite falls back to the leaf group, never dropped", () => {
  const m = emptyMap();
  put(m, 0, 5, 5, rawOf(CHAIR));
  const g = groupItems(m, field(m), src({ kind: "leaf", url: "leaf.png" }));
  expect(g.upright.get("leaf.png")).toHaveLength(1);
});

test("the sprite variant comes from the item's count bits", () => {
  const m = emptyMap();
  put(m, 0, 5, 5, rawOf(CHAIR) | (3n << 32n));
  let seen = -1;
  groupItems(m, field(m), { resolve: (_id, count) => ((seen = count), { kind: "pack", url: "p" }) });
  expect(seen).toBe(3);
});

test("empty and extension tiles add nothing; an item on the last tile does not throw", () => {
  const m = emptyMap();
  put(m, 0, 4, 4, 0xfffdn); // extension tile
  put(m, 0, 287, 191, rawOf(CHAIR));
  const g = groupItems(m, field(m), src({ kind: "pack", url: "p" }));
  expect(g.flat.get("p")).toHaveLength(1);
  expect(Number.isFinite(g.flat.get("p")![0]!.y)).toBe(true);
});

test("items are placed relative to the layer origin when fewer acres are used", () => {
  const m = emptyMap();
  for (const l of m.items) Object.assign(l, { width: 224, raw: new BigUint64Array(224 * 192).fill(0xfffen) }); // 7 acres: origin x = 32
  m.items[0].raw[192 * 3 + 4] = rawOf(CHAIR);
  const g = groupItems(m, field(m), src({ kind: "pack", url: "p" }));
  expect(g.flat.get("p")![0]).toMatchObject({ x: 32 + 3 + 1, z: 32 + 4 + 1 });
});

test("instances carry their root tile and layer", () => {
  const m = emptyMap();
  put(m, 0, 10, 12, rawOf(CHAIR));
  put(m, 1, 20, 21, rawOf(CHAIR));
  const g = groupItems(m, field(m), src({ kind: "icon", url: "i" }));
  const all = g.upright.get("i")!;
  expect(all.find((a) => a.layer === 0)).toMatchObject({ tile: { x: 10, y: 12 } });
  expect(all.find((a) => a.layer === 1)).toMatchObject({ tile: { x: 20, y: 21 } });
});

test("items with a model key go to the model groups only, at the footprint centre and ground height", () => {
  const m = emptyMap();
  m.terrain.elevation[96 * 10 + 10] = 1; // terrain tile (10,10): world units 52..54, ground 2
  put(m, 0, 52, 20, rawOf(CHAIR)); // item tile (52,20) -> world (52,52) in a 9-acre layer
  put(m, 1, 80, 40, rawOf(CHAIR));
  const g = groupItems(m, field(m), src({ kind: "icon", url: "i" }), (id) => (id === CHAIR ? "Oak@-" : null));
  expect(g.upright.size).toBe(0);
  expect(g.flat.size).toBe(0);
  const list = g.models.get("Oak@-")!;
  expect(list).toHaveLength(2);
  const a = list.find((i) => i.layer === 0)!;
  expect(a).toMatchObject({ x: 53, z: 53, w: 2, h: 2, tile: { x: 52, y: 20 } });
  expect(a.y).toBeGreaterThan(0);
});

test("an id with no model key still goes to the billboard groups, and no key function means no models", () => {
  const m = emptyMap();
  put(m, 0, 5, 5, rawOf(CHAIR));
  const withKeys = groupItems(m, field(m), src({ kind: "icon", url: "i" }), () => null);
  expect(withKeys.upright.get("i")).toHaveLength(1);
  expect(withKeys.models.size).toBe(0);
  expect(groupItems(m, field(m), src({ kind: "icon", url: "i" })).models.size).toBe(0);
});
