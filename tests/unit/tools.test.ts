import { expect, test } from "bun:test";
import { createStroke } from "../../app/src/map/tools";

test("consecutive duplicate tiles collapse", () => {
  const s = createStroke("erase", 0);
  for (const [x, y] of [[1, 1], [1, 1], [2, 1], [2, 1], [1, 1]]) s.add(x!, y!);
  expect(s.done()!.tiles).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }]);
});

test("a place stroke skips tiles that fall inside an earlier stamp's footprint", () => {
  const s = createStroke("place", 1, { w: 4, h: 4 });
  for (const x of [10, 11, 12, 13, 14, 15]) s.add(x, 10);
  expect(s.done()!.tiles.map((t) => t.x)).toEqual([10, 14]);
  const t = createStroke("place", 1, { w: 4, h: 4 });
  t.add(10, 10);
  t.add(10, 12); // overlaps in y
  t.add(10, 14);
  expect(t.done()!.tiles.map((p) => p.y)).toEqual([10, 14]);
});

test("a rect stroke keeps normalized corners whichever way it is dragged", () => {
  const s = createStroke("rect", 0);
  s.add(20, 30);
  s.add(25, 33);
  s.add(12, 18);
  expect(s.rect()).toEqual({ x0: 12, y0: 18, x1: 20, y1: 30 });
  expect(s.done()!.rect).toEqual({ x0: 12, y0: 18, x1: 20, y1: 30 });
});

test("an eyedropper stroke is the last tile only", () => {
  const s = createStroke("eyedropper", 0);
  s.add(1, 2);
  s.add(3, 4);
  expect(s.done()!.tiles).toEqual([{ x: 3, y: 4 }]);
});

test("a stroke with no tiles yields null", () => {
  expect(createStroke("place", 0).done()).toBeNull();
  expect(createStroke("rect", 1).done()).toBeNull();
});
