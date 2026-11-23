import { expect, test } from "bun:test";
import { createGestures, type PaintSink } from "../../app/src/map3d/gestures";
import type { Tile } from "../../app/src/map3d/pick";

function setup(opts: { sink?: boolean; space?: boolean; tile?: (x: number, y: number) => Tile | null } = {}) {
  const log: string[] = [];
  const sink: PaintSink = {
    start: (t) => log.push(`start ${t.x},${t.y}`),
    move: (t) => log.push(`move ${t.x},${t.y}`),
    end: () => log.push("end"),
    cancel: () => log.push("cancel"),
  };
  const state = { space: opts.space ?? false };
  const g = createGestures({
    sink: () => (opts.sink === false ? null : sink),
    tileAt: opts.tile ?? ((x, y) => ({ x, y })),
    spaceHeld: () => state.space,
    onHover: (x, y) => log.push(`hover ${x},${y}`),
  });
  return { g, log, state };
}

test("a left press, moves and release paint one stroke", () => {
  const { g, log } = setup();
  expect(g.down({ id: 1, button: 0, x: 1, y: 2 })).toBe(true);
  expect(g.painting).toBe(true);
  g.move({ id: 1, x: 3, y: 4 });
  g.up({ id: 1, cancelled: false });
  expect(log).toEqual(["start 1,2", "hover 3,4", "move 3,4", "end"]);
  expect(g.painting).toBe(false);
});

test("a press that hits no tile starts nothing, and a move that hits none is skipped", () => {
  const miss = setup({ tile: () => null });
  expect(miss.g.down({ id: 1, button: 0, x: 0, y: 0 })).toBe(false);
  expect(miss.log).toEqual([]);
  let first = true;
  const { g, log } = setup({ tile: (x, y) => (first ? ((first = false), { x, y }) : null) });
  g.down({ id: 1, button: 0, x: 1, y: 1 });
  g.move({ id: 1, x: 2, y: 2 });
  g.up({ id: 1, cancelled: false });
  expect(log).toEqual(["start 1,1", "hover 2,2", "end"]);
});

test("a second finger cancels the stroke and a later release does nothing", () => {
  const { g, log } = setup();
  g.down({ id: 1, button: 0, x: 1, y: 1 });
  expect(g.down({ id: 2, button: 0, x: 5, y: 5 })).toBe(false);
  g.up({ id: 1, cancelled: false });
  g.up({ id: 2, cancelled: false });
  expect(log).toEqual(["start 1,1", "cancel"]);
});

test("a cancelled pointer cancels instead of committing", () => {
  const { g, log } = setup();
  g.down({ id: 1, button: 0, x: 1, y: 1 });
  g.up({ id: 1, cancelled: true });
  expect(log).toEqual(["start 1,1", "cancel"]);
});

test("cancel() mid-stroke cancels once, e.g. when the view is torn down", () => {
  const { g, log } = setup();
  g.down({ id: 1, button: 0, x: 1, y: 1 });
  g.cancel();
  g.cancel();
  g.up({ id: 1, cancelled: false });
  expect(log).toEqual(["start 1,1", "cancel"]);
});

test("right button, held space, no sink or a second simultaneous pointer never start a stroke", () => {
  expect(setup().g.down({ id: 1, button: 2, x: 0, y: 0 })).toBe(false);
  expect(setup({ space: true }).g.down({ id: 1, button: 0, x: 0, y: 0 })).toBe(false);
  expect(setup({ sink: false }).g.down({ id: 1, button: 0, x: 0, y: 0 })).toBe(false);
  const { g, log } = setup();
  g.down({ id: 1, button: 2, x: 0, y: 0 });
  expect(g.down({ id: 2, button: 0, x: 1, y: 1 })).toBe(false);
  expect(log).toEqual([]);
});

test("moving an unknown pointer only reports the hover", () => {
  const { g, log } = setup();
  g.move({ id: 9, x: 7, y: 8 });
  expect(log).toEqual(["hover 7,8"]);
});

test("a stroke finishes on the sink it started with even if the tool changes meanwhile", () => {
  const log: string[] = [];
  const a: PaintSink = { start: () => log.push("a start"), move: () => {}, end: () => log.push("a end"), cancel: () => {} };
  const b: PaintSink = { start: () => log.push("b start"), move: () => {}, end: () => log.push("b end"), cancel: () => {} };
  let cur = a;
  const g = createGestures({ sink: () => cur, tileAt: (x, y) => ({ x, y }), spaceHeld: () => false, onHover() {} });
  g.down({ id: 1, button: 0, x: 0, y: 0 });
  cur = b;
  g.up({ id: 1, cancelled: false });
  expect(log).toEqual(["a start", "a end"]);
});
