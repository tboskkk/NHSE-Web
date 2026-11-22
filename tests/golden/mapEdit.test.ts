import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyOp, type EditOp } from "../../packages/core/src/edit/ops";
import { isExtension, isNone } from "../../packages/core/src/map/footprint";
import { planMapEdit } from "../../packages/core/src/map/applyMapEdit";
import { readMap } from "../../packages/core/src/map/mapData";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { idOfSize, rawOf } from "../unit/mapFixture";
import { goldenTest, readDir, REPO, runReference, SAVE, tempDir } from "./helpers";

const hex = (r: bigint) => r.toString(16).padStart(16, "0");
const NONE = 0xfffen;

goldenTest("mapEdit is byte-identical to upstream for place, multi-tile, rotation, erase and replace", async () => {
  const acreTiles = new Uint8Array(readFileSync(join(REPO, "app/public/data/acretiles.bin")));
  const sav = await HorizonSave.load(readDir(SAVE!));
  const map = readMap(sav.main.data, sav.revision);
  const ctx = { map, acreTiles };
  const ONE = rawOf(idOfSize("S_1_0x1_0")), BIG = rawOf(idOfSize("S_2_0x2_0")), WIDE = rawOf(idOfSize("S_2_0x1_0"), 1);
  const ch = (x: number, y: number, raw: bigint) => ({ x, y, raw: hex(raw) });

  // free, mutually distant spots per the strict rules (checked on both layers with the largest item)
  const spots: { x: number; y: number }[] = [];
  for (let x = 40; x < 250 && spots.length < 8; x += 12)
    for (let y = 40; y < 160 && spots.length < 8; y += 12) {
      const probe = (layer: 0 | 1) => { try { planMapEdit(ctx, { op: "mapEdit", layer, label: "p", changes: [ch(x, y, BIG)] }); return true; } catch { return false; } };
      if (probe(0) && probe(1)) spots.push({ x, y });
    }
  expect(spots.length).toBe(8);
  // an existing multi-tile root on layer 0 to erase through one of its extension tiles
  let existing: { x: number; y: number } | null = null;
  const l0 = map.items[0];
  for (let x = 0; x < l0.width && !existing; x++)
    for (let y = 0; y < l0.height && !existing; y++) {
      const r = l0.raw[l0.height * x + y]!;
      if (isExtension(r)) existing = { x, y };
    }
  expect(existing).not.toBeNull();

  const ops: EditOp[] = [
    { op: "mapEdit", layer: 0, label: "a", changes: [ch(spots[0]!.x, spots[0]!.y, ONE), ch(spots[1]!.x, spots[1]!.y, BIG), ch(spots[2]!.x, spots[2]!.y, WIDE)] },
    { op: "mapEdit", layer: 1, label: "b", changes: [ch(spots[3]!.x, spots[3]!.y, ONE), ch(spots[4]!.x, spots[4]!.y, BIG)] },
    // erase through an extension tile of the BIG placed above
    { op: "mapEdit", layer: 0, label: "c", changes: [ch(spots[1]!.x + 2, spots[1]!.y + 3, NONE)] },
    // replace: BIG, then ONE on top of its middle
    { op: "mapEdit", layer: 0, label: "d", changes: [ch(spots[5]!.x, spots[5]!.y, BIG), ch(spots[5]!.x + 1, spots[5]!.y + 1, ONE)] },
    // erase an item that was already on the island
    { op: "mapEdit", layer: 0, label: "e", changes: [ch(existing!.x, existing!.y, NONE)] },
  ];

  const tmp = tempDir();
  const opsPath = join(tmp, "ops.json");
  const out = join(tmp, "out");
  await Bun.write(opsPath, JSON.stringify(ops));
  await runReference(["edit", SAVE!, opsPath, "12345", out]);
  const expected = readDir(out);

  for (const op of ops) applyOp(sav, op, { acreTiles });
  const actual = new Map([...sav.passthrough, ...(await sav.save(12345))]);
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
  for (const [k, v] of expected) expect(Buffer.from(actual.get(k)!).equals(Buffer.from(v))).toBe(true);

  // sanity: the edits really happened
  const after = readMap(sav.main.data, sav.revision);
  expect(isNone(after.items[0].raw[192 * existing!.x + existing!.y]!)).toBe(true);
  expect(after.items[1].raw[192 * spots[4]!.x + spots[4]!.y]).toBe(BIG);
});
