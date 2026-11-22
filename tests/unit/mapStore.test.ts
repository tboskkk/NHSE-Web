import { expect, test } from "bun:test";
import { createMapStore } from "../../app/src/map/mapStore";
import type { MapView } from "../../app/src/worker/protocol";
import { emptyMap } from "./mapFixture";

const view = () => ({ ...emptyMap(), revisionLabel: "3.0.3" }) as MapView;

test("patch writes raw values at tile indices and bumps the version", () => {
  const store = createMapStore(view());
  const seen: number[] = [];
  store.subscribe((v) => seen.push(v));
  expect(store.version).toBe(0);
  store.patch([{ layer: 1, index: 192 * 3 + 4, raw: "0000000000001234" }]);
  expect(store.map.items[1].raw[192 * 3 + 4]).toBe(0x1234n);
  expect(store.version).toBe(1);
  expect(seen).toEqual([1]);
});

test("an empty patch does not bump the version", () => {
  const store = createMapStore(view());
  store.patch([]);
  expect(store.version).toBe(0);
});

test("an out-of-range index throws and changes nothing", () => {
  const store = createMapStore(view());
  expect(() => store.patch([{ layer: 0, index: 1, raw: "0000000000000001" }, { layer: 0, index: 288 * 192, raw: "0000000000000001" }])).toThrow(RangeError);
  expect(store.map.items[0].raw[1]).toBe(0xfffen);
  expect(store.version).toBe(0);
});
