import { expect, test } from "bun:test";
import { transferables } from "../../app/src/worker/transfer";

test("collects each distinct ArrayBuffer from nested typed arrays once", () => {
  const shared = new Uint8Array(8);
  const v = { a: new Uint16Array(4), nested: { b: new BigUint64Array(2), list: [shared, shared.subarray(2)] }, n: 5, s: "x" };
  const t = transferables(v);
  expect(t.length).toBe(3);
  expect(new Set(t).size).toBe(3);
});

test("handles Maps of Uint8Array and primitives", () => {
  expect(transferables(new Map([["a", new Uint8Array(2)]])).length).toBe(1);
  expect(transferables(null)).toEqual([]);
  expect(transferables(42)).toEqual([]);
});
