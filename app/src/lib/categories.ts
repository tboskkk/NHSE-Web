import { isClothing, isCrafting, isFurniture } from "@nhse/core";

const kinds = (...k: string[]) => (_id: number, kind: string) => k.includes(kind);

/** Picker category chips; each predicate gets an item id and its kind name. */
export const CATEGORIES: { id: string; label: string; test: (id: number, kind: string) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "furniture", label: "Furniture", test: (id) => isFurniture(id) },
  { id: "clothing", label: "Clothing", test: (id) => isClothing(id) },
  { id: "crafting", label: "Crafting", test: (id) => isCrafting(id) },
  { id: "recipes", label: "DIY recipes", test: kinds("Kind_DIYRecipe") },
  { id: "tools", label: "Tools", test: kinds("Kind_Axe", "Kind_Shovel", "Kind_Net", "Kind_FishingRod", "Kind_Slingshot", "Kind_Watering", "Kind_Ladder") },
  { id: "critters", label: "Critters", test: kinds("Kind_Fish", "Kind_DiveFish", "Kind_Insect") },
  { id: "fossils", label: "Fossils", test: kinds("Kind_Fossil", "Kind_FossilUnknown") },
  { id: "plants", label: "Flowers & plants", test: kinds("Kind_Flower", "Kind_FlowerSeed", "Kind_FlowerBud", "Kind_Fruit") },
];
