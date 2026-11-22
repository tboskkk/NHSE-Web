import { fieldItemName, getKind, isFlowerGene } from "../items/itemInfo";
import itemData from "../generated/items.json";
import { formatFlowerGenes, Item } from "../structures/item";

type LangFile = { noneName: string; items: string[]; remakeBody: Record<string, string[]>; remakeFabric: Record<string, string[]> };

const recipes = itemData.recipes as Record<string, number>;

/** Localized game text (port of the item-name parts of NHSE.Core GameStrings). */
export class GameStrings {
  private constructor(
    readonly lang: string,
    private readonly data: LangFile,
  ) {}

  /** `fetcher` resolves a path such as "data/lang/en.json" to parsed JSON (fetch in the app, file read in tests). */
  static async load(lang: string, fetcher: (path: string) => Promise<unknown>): Promise<GameStrings> {
    return new GameStrings(lang, (await fetcher(`data/lang/${lang}.json`)) as LangFile);
  }

  get items(): readonly string[] { return this.data.items; }
  get noneName(): string { return this.data.noneName; }
  remakeBody(id: number): string[] | undefined { return this.data.remakeBody[String(id)]; }
  remakeFabric(id: number): string[] | undefined { return this.data.remakeFabric[String(id)]; }

  /** Name by item id; ids past the table use field-item names ("???" when unknown). */
  getItemNameById(id: number): string {
    if (id < this.data.items.length) return this.data.items[id]!;
    return fieldItemName(id) ?? (id === Item.LLOYD ? "Lloyd" : "???");
  }

  /** Full display name for an item including recipe / fossil / tree / flower-gene detail. */
  getItemName(item: Item): string {
    const id = item.itemId;
    if (id === Item.NONE) return this.data.noneName;
    if (id === Item.EXTENSION) return this.getItemNameById(item.extensionItemId);

    const kind = getKind(id);

    if (isFlowerGene(id)) {
      const display = this.getItemNameById(id);
      if (item.genes !== 0) return `${display} - ${formatFlowerGenes(item.genes)}`;
    }

    if (kind === "Kind_DIYRecipe" || kind === "Kind_MessageBottle") {
      const display = this.data.items[id] ?? this.getItemNameById(id);
      const recipeId = item.freeParam & 0xffff;
      const result = recipes[String(recipeId)];
      const makes = result !== undefined ? this.getItemNameById(result) : String(recipeId).padStart(3, "0");
      return `${display} - ${makes}`;
    }

    if (kind === "Kind_FossilUnknown") {
      const display = this.data.items[id] ?? this.getItemNameById(id);
      return `${display} - ${this.getItemNameById(item.freeParam & 0xffff)}`;
    }

    if (kind === "Kind_Tree") {
      const display = this.getItemNameById(id);
      const willDrop = item.count;
      if (willDrop !== 0) return `${display} - ${this.getItemNameById(willDrop)}`;
    }

    return this.getItemNameById(id);
  }
}
