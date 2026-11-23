import { expect, test } from "bun:test";
import { keyDelta } from "../../app/src/map3d/cameraKeys";

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

test("W/S/A/D pan 4 units relative to the camera azimuth (azimuth 0: looking north)", () => {
  const w = keyDelta("w", 0)!;
  near(w.dx, 0); near(w.dz, -4);
  const d = keyDelta("d", 0)!;
  near(d.dx, 4); near(d.dz, 0);
  const left = keyDelta("ArrowLeft", 0)!;
  near(left.dx, -4); near(left.dz, 0);
  const s = keyDelta("ArrowDown", 0)!;
  near(s.dz, 4);
});

test("panning rotates with the azimuth", () => {
  const w = keyDelta("w", Math.PI / 2)!; // facing east
  near(w.dx, 4); near(w.dz, 0);
});

test("R and F tilt the camera", () => {
  expect(keyDelta("r", 0)).toEqual({ dx: 0, dz: 0, dPolar: -0.05 });
  expect(keyDelta("f", 0)).toEqual({ dx: 0, dz: 0, dPolar: 0.05 });
});

test("other keys are ignored", () => {
  expect(keyDelta("x", 0)).toBeNull();
});
