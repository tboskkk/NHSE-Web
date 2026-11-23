import { expect, test } from "bun:test";
import { controlsConfig } from "../../app/src/map3d/controlsMode";

test("view mode: left orbits, right pans, one finger orbits", () => {
  expect(controlsConfig(false, false)).toEqual({ left: "rotate", middle: "dolly", right: "pan", oneFinger: "rotate", twoFingers: "dolly-pan" });
});

test("edit mode: left and one finger are free for painting, right orbits, middle pans", () => {
  expect(controlsConfig(true, false)).toEqual({ left: null, middle: "pan", right: "rotate", oneFinger: null, twoFingers: "dolly-rotate" });
});

test("holding Space in edit mode turns the left button into a pan", () => {
  expect(controlsConfig(true, true).left).toBe("pan");
  expect(controlsConfig(false, true).left).toBe("rotate");
});
