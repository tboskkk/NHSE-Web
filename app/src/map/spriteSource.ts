import { getMenuIconSprite, LEAF_SPRITE, spriteItemId } from "@nhse/core";

export type SpriteRef = { kind: "pack" | "icon" | "leaf"; url: string };

export interface SpriteSource {
  resolve(itemId: number, count: number): SpriteRef;
}

/**
 * Lookup order (matches upstream ItemSprite): `id_count`, then `id_0`, then the bundled menu icon, then the leaf.
 * `pack` maps `${id}_${variant}` to a loadable URL; `base` prefixes the bundled sprite paths.
 */
export function createSpriteSource(pack: ReadonlyMap<string, string>, itemCount: number, base: string): SpriteSource {
  return {
    resolve(itemId, count) {
      const id = spriteItemId(itemId, itemCount);
      const hit = pack.get(`${id}_${count}`) ?? pack.get(`${id}_0`);
      if (hit !== undefined) return { kind: "pack", url: hit };
      const icon = getMenuIconSprite(id);
      return { kind: icon === LEAF_SPRITE ? "leaf" : "icon", url: `${base}${icon}` };
    },
  };
}
