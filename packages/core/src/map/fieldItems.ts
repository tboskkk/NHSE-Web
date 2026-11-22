import items from "../generated/items.json";

const fieldItems = items.fieldItems as unknown as Record<string, { held: number }>;

/** FieldItemDefinition.HeldItemId (Pick, else Dig, else the id itself); identity for ids outside FieldItemList. */
export function heldItemId(id: number): number {
  return fieldItems[id]?.held ?? id;
}

/** Port of ItemSprite.TryGetFieldItemId: the item id whose sprite represents a placed field item. */
export function spriteItemId(id: number, itemCount: number): number {
  if (id < itemCount) return id;
  const held = fieldItems[id]?.held;
  if (held === undefined) return id;
  return held >= itemCount ? id : held;
}
