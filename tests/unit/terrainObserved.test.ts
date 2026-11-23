import { expect, test } from "bun:test";
import observed from "../../packages/core/src/generated/terrain-observed.json";

const CLASSES = ["base", "river", "cliff", "fall", "road", "other"];

test("observed table has the flat-ground triple and well-formed keys", () => {
  expect(observed.ground["0,0,0"]).toBeGreaterThan(0);
  expect(observed.road["0,0,0"]).toBeGreaterThan(0);
  for (const k of [...Object.keys(observed.ground), ...Object.keys(observed.road)]) expect(k).toMatch(/^\d+,\d+,\d+$/);
});

test("elevation ranges are min<=max pairs keyed by unit class", () => {
  const r = observed.elevation as Record<string, number[]>;
  expect(r.base).toHaveLength(2);
  for (const [k, [lo, hi]] of Object.entries(r)) {
    expect(CLASSES).toContain(k);
    expect(lo!).toBeLessThanOrEqual(hi!);
  }
});
