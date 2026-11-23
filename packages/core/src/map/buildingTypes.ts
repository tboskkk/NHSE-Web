/** Upstream BuildingType values: 1-29 and 42 (Hotel). */
export const BRIDGE = 26;
export const INCLINE = 27;
export const KNOWN_BUILDING_TYPES: ReadonlySet<number> = new Set([...Array.from({ length: 29 }, (_, i) => i + 1), 42]);

export function isKnownBuildingType(t: number): boolean {
  return KNOWN_BUILDING_TYPES.has(t);
}

/** Types that may exist more than once. */
export function isMultiInstanceType(t: number): boolean {
  return t === BRIDGE || t === INCLINE;
}

/** Types whose ground rule is skipped (labeled unverified in the UI). */
export function skipsGroundRule(t: number): boolean {
  return t === BRIDGE || t === INCLINE;
}

/** Resident Services structure (20) and tent (23) stand inside the plaza. */
export function mayOverlapPlaza(t: number): boolean {
  return t === 20 || t === 23;
}
