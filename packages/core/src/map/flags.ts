import type { Revision } from "../save/revisions";

/**
 * Field item "active" flags. Analysis of a real save (tests/golden/itemFlags.test.ts) could not confirm a per-tile
 * layout: upstream sizes the region as one byte per tile while its upgrade code implies a bitmap, the bitmap holds
 * almost no set bits and none on roots, and the byte reading lands on empty/extension tiles. Until that is understood
 * the editor never writes flag bytes.
 */
export const flagPolicy = "untouched" as const;

/** No-op under the "untouched" policy; kept as the single hook a confirmed layout would implement. */
export function clearFlagBit(_main: Uint8Array, _rev: Revision, _layer: 0 | 1, _x: number, _y: number): void {}
