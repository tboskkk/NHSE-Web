/** 3D tuning constants (world units are item tiles). Everything that is judged by eye lives here. */
export const LEVEL_HEIGHT = 2;
export const WATER_Y = -1.5;
/** Acre template tile classes drawn as water (sea/river family of the 2D class colour table). */
export const WATER_CLASSES: ReadonlySet<number> = new Set([1, 5, 12, 15, 46, 149, 150]);
export const CLIFF_RGB = [94, 98, 106] as const; // upstream cliff grey (118,122,132) x 0.8
export const BANK_RGB = [138, 122, 90] as const;
