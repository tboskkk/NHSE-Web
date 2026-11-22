import itemData from "../generated/items.json";

type Remake = { body: number[]; fabric: number[] };
type FieldItem = { name: string; kind: number };

const kinds = itemData.kind as number[];
const kindNames = itemData.kindNames as string[];
const icons = itemData.menuIcon as number[];
const iconNames = itemData.menuIconNames as string[];
const iconFiles = new Set(itemData.menuIconFiles as string[]);
const fieldItems = itemData.fieldItems as unknown as Record<string, FieldItem>;
const remake = itemData.remake as unknown as Record<string, Remake>;
const recipes = itemData.recipes as Record<string, number>;
const groups = itemData.kindGroups as Record<"furniture" | "clothing" | "crafting" | "flower" | "flowerPicked", string[]>;
const sets = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, new Set(v)])) as Record<keyof typeof groups, Set<string>>;

const UNKNOWN_KIND = 255;
export const LEAF_SPRITE = "sprites/leaf.png";

function kindId(id: number): number {
  if (id < kinds.length) return kinds[id]!;
  return fieldItems[String(id)]?.kind ?? UNKNOWN_KIND;
}

/** Kind name (e.g. "Kind_DIYRecipe"); "Unknown" when the id is not in any table. */
export function getKind(id: number): string {
  const name = kindNames[kindId(id)];
  return name ? name : "Unknown";
}

/** Relative URL of the item's menu-icon sprite; the generic leaf when no icon file exists. */
export function getMenuIconSprite(id: number): string {
  if (id >= icons.length) return LEAF_SPRITE;
  const name = iconNames[icons[id]!] ?? "";
  return iconFiles.has(name) ? `sprites/menuicon/${name}.png` : LEAF_SPRITE;
}

export const isFurniture = (id: number): boolean => sets.furniture.has(getKind(id));
export const isClothing = (id: number): boolean => sets.clothing.has(getKind(id));
export const isCrafting = (id: number): boolean => sets.crafting.has(getKind(id));

/** ItemKind.IsFlowerGene(id): a flower kind, and either a field id or not a picked flower. */
export function isFlowerGene(id: number): boolean {
  const k = getKind(id);
  return sets.flower.has(k) && (id >= 60000 || !sets.flowerPicked.has(k));
}

/** Valid customization variant indices (0-7) for an item, or undefined when it has none. */
export const remakeInfo = (id: number): Remake | undefined => remake[String(id)];

/** Item id a DIY recipe id produces. */
export const recipeItem = (recipeId: number): number | undefined => recipes[String(recipeId)];

export const fieldItemName = (id: number): string | undefined => fieldItems[String(id)]?.name;
export const flowerGeneNames = itemData.flowerGeneNames as Record<string, number>;
