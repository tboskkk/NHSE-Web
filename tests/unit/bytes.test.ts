import { expect, test } from "bun:test";
import { getUtf16, replaceOccurrences, setUtf16, u16, u32, setU16, setU32 } from "../../packages/core/src/util/bytes";

test("u16/u32 are little-endian and unsigned", () => {
  const d = new Uint8Array([0xff, 0xff, 0xff, 0xff, 1, 0]);
  expect(u32(d, 0)).toBe(0xffffffff);
  expect(u16(d, 4)).toBe(1);
  setU32(d, 0, 0x80000000); expect([...d.slice(0, 4)]).toEqual([0, 0, 0, 0x80]);
  setU16(d, 4, 0xABCD); expect([...d.slice(4, 6)]).toEqual([0xCD, 0xAB]);
});

test("setUtf16 truncates/pads to exactly maxChars units and getUtf16 stops at NUL", () => {
  const d = new Uint8Array(30).fill(0xAA);
  setUtf16(d, 0, "ABCDEFGHIJKLMNOP", 10);
  expect(getUtf16(d, 0, 10)).toBe("ABCDEFGHIJ");
  expect([...d.slice(20, 24)]).toEqual([0xAA, 0xAA, 0xAA, 0xAA]); // no overflow
  setUtf16(d, 0, "Hi", 10);
  expect(getUtf16(d, 0, 10)).toBe("Hi");
  expect([...d.slice(4, 20)].every((x) => x === 0)).toBe(true);
});

test("replaceOccurrences swaps every non-overlapping match and returns the count", () => {
  const d = new Uint8Array([1, 2, 3, 9, 1, 2, 3, 1, 2]);
  expect(replaceOccurrences(d, new Uint8Array([1, 2, 3]), new Uint8Array([7, 7, 7]))).toBe(2);
  expect([...d]).toEqual([7, 7, 7, 9, 7, 7, 7, 1, 2]);
  expect(replaceOccurrences(d, new Uint8Array([4]), new Uint8Array([5]))).toBe(0);
  expect(replaceOccurrences(d, new Uint8Array([1]), new Uint8Array([1]))).toBe(0);
  expect(replaceOccurrences(d, new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(-1);
});
