import { expect, test } from "bun:test";
import { EditSession } from "../../packages/core/src/edit/session";

type Pair = { path: string; data: Uint8Array };
function setup() {
  const a: Pair = { path: "a", data: new Uint8Array(64) };
  const b: Pair = { path: "b", data: new Uint8Array(64) };
  const save = { pairs: () => [a, b] };
  return { a, b, s: new EditSession(save) };
}

test("changes 8 or fewer bytes apart coalesce into one patch", () => {
  const { a, s } = setup();
  const c = s.apply("edit", () => { a.data[3] = 1; a.data[9] = 2; })!;
  expect(c.patches.length).toBe(1);
  expect(c.patches[0]!.path).toBe("a");
  expect(c.patches[0]!.offset).toBe(3);
  expect(c.patches[0]!.after.length).toBe(7);
  expect([...c.patches[0]!.before]).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect([...c.patches[0]!.after]).toEqual([1, 0, 0, 0, 0, 0, 2]);
});

test("changes far apart stay separate patches", () => {
  const { a, s } = setup();
  const c = s.apply("edit", () => { a.data[3] = 1; a.data[20] = 2; })!;
  expect(c.patches.map((p) => [p.offset, p.after.length])).toEqual([[3, 1], [20, 1]]);
});

test("a no-op apply returns null and is not recorded", () => {
  const { a, s } = setup();
  expect(s.apply("noop", () => { a.data[1] = a.data[1]!; })).toBeNull();
  expect(s.changes.length).toBe(0);
  expect(s.undo()).toBeNull();
  expect(s.redo()).toBeNull();
});

test("undo restores exact bytes and redo reapplies them, across pairs", () => {
  const { a, b, s } = setup();
  a.data.fill(7);
  const base = new EditSession({ pairs: () => [a, b] }); // fresh baseline with fill(7)
  base.apply("e", () => { a.data[0] = 9; b.data[63] = 5; });
  expect(a.data[0]).toBe(9);
  expect(base.undo()!.label).toBe("e");
  expect(a.data[0]).toBe(7);
  expect(b.data[63]).toBe(0);
  expect(base.redo()!.label).toBe("e");
  expect(a.data[0]).toBe(9);
  expect(b.data[63]).toBe(5);
  void s;
});

test("a new edit after an undo clears redo; changes lists applied edits oldest first", () => {
  const { a, s } = setup();
  s.apply("one", () => { a.data[0] = 1; });
  s.apply("two", () => { a.data[10] = 2; });
  expect(s.changes.map((c) => c.label)).toEqual(["one", "two"]);
  s.undo();
  expect(s.changes.map((c) => c.label)).toEqual(["one"]);
  s.apply("three", () => { a.data[30] = 3; });
  expect(s.redo()).toBeNull();
  expect(s.changes.map((c) => c.label)).toEqual(["one", "three"]);
});

test("an apply that throws is rolled back and not recorded", () => {
  const { a, s } = setup();
  expect(() => s.apply("boom", () => { a.data[5] = 9; throw new Error("boom"); })).toThrow("boom");
  expect(a.data[5]).toBe(0);
  expect(s.changes.length).toBe(0);
});

test("dirtyPairs tracks differences from the last markSaved baseline", () => {
  const { a, b, s } = setup();
  s.apply("a", () => { a.data[0] = 1; });
  expect([...s.dirtyPairs()]).toEqual(["a"]);
  s.markSaved();
  expect(s.dirtyPairs().size).toBe(0);

  s.apply("b", () => { b.data[0] = 1; });
  expect([...s.dirtyPairs()]).toEqual(["b"]);
  s.undo();
  expect(s.dirtyPairs().size).toBe(0); // edit then undo after a save leaves nothing to write

  s.undo(); // undoing the pre-save edit changes pair a relative to what was saved
  expect([...s.dirtyPairs()]).toEqual(["a"]);
  expect(a.data[0]).toBe(0);
});

test("bytes changed outside apply (e.g. save-time hash fixes) are absorbed by markSaved", () => {
  const { a, s } = setup();
  a.data[40] = 0xaa; // not an edit
  s.markSaved();
  const c = s.apply("edit", () => { a.data[0] = 1; })!;
  expect(c.patches.length).toBe(1);
  expect(c.patches[0]!.offset).toBe(0);
  s.undo();
  expect(s.dirtyPairs().size).toBe(0);
  expect(a.data[40]).toBe(0xaa);
});
