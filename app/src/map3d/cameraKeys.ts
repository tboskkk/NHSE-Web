const STEP = 4;
const TILT = 0.05;

/**
 * Camera keys: WASD/arrows pan the orbit target (relative to where the camera looks), R/F tilt.
 * `azimuth` is the direction the camera looks in, radians, 0 = north (-z), pi/2 = east (+x).
 */
export function keyDelta(key: string, azimuth: number): { dx: number; dz: number; dPolar: number } | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  const fwd = k === "w" || k === "ArrowUp" ? 1 : k === "s" || k === "ArrowDown" ? -1 : 0;
  const side = k === "d" || k === "ArrowRight" ? 1 : k === "a" || k === "ArrowLeft" ? -1 : 0;
  if (fwd || side) {
    const fx = Math.sin(azimuth), fz = -Math.cos(azimuth); // forward
    const rx = Math.cos(azimuth), rz = Math.sin(azimuth); // right
    return { dx: STEP * (fwd * fx + side * rx), dz: STEP * (fwd * fz + side * rz), dPolar: 0 };
  }
  if (k === "r") return { dx: 0, dz: 0, dPolar: -TILT };
  if (k === "f") return { dx: 0, dz: 0, dPolar: TILT };
  return null;
}
