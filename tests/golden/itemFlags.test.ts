import { expect } from "bun:test";
import { flagPolicy } from "../../packages/core/src/map/flags";
import { readMap } from "../../packages/core/src/map/mapData";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { goldenTest, readDir, SAVE } from "./helpers";

goldenTest("item flag layout analysis", async () => {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const main = sav.main.data;
  const o = sav.revision.mainOffsets;
  const m = readMap(main, sav.revision);
  const W = m.items[0].width, H = m.items[0].height, N = W * H;
  const base = o.fieldItem + N * 8 * 2;
  const kind = (layer: 0 | 1, x: number, y: number) => {
    const id = Number(m.items[layer].raw[H * x + y]! & 0xffffn);
    return id === 0xfffe ? "empty" : id === 0xfffd ? "ext" : "root";
  };
  const stats = (name: string, get: (layer: 0 | 1, x: number, y: number) => boolean) => {
    const r = { set: 0, onEmptyOrExt: 0, onRoot: 0 };
    for (const layer of [0, 1] as const)
      for (let x = 0; x < W; x++)
        for (let y = 0; y < H; y++)
          if (get(layer, x, y)) { r.set++; kind(layer, x, y) === "root" ? r.onRoot++ : r.onEmptyOrExt++; }
    console.log(name, JSON.stringify(r));
    return r;
  };
  const bit = (off: number, i: number) => ((main[off + (i >> 3)]! >> (i & 7)) & 1) === 1;
  const A = N / 8;
  const a = stats("A bitmap row-major", (l, x, y) => bit(base + l * A, y * W + x));
  stats("A' bitmap col-major", (l, x, y) => bit(base + l * A, H * x + y));
  const b = stats("B bytes col-major", (l, x, y) => main[base + l * N + H * x + y]! !== 0);
  stats("B' bytes row-major", (l, x, y) => main[base + l * N + y * W + x]! !== 0);
  // Finding: the bitmap layout (A) is nearly empty and never marks a root item, so it cannot be confirmed as
  // "active flags on roots"; the byte layout (B) lands mostly on empty/extension tiles, so it is not a per-tile flag.
  // Neither is consistent, hence flagPolicy "untouched": mapEdit never writes flag bytes.
  expect(a.onRoot).toBe(0);
  expect(a.set).toBeLessThanOrEqual(2);
  expect(b.onEmptyOrExt).toBeGreaterThan(b.onRoot * 10);
  expect(flagPolicy).toBe("untouched");
});
