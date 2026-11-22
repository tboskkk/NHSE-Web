<script lang="ts">
  import { getKind, Item, recipeIds, recipeItem, remakeInfo, type GameStrings } from "@nhse/core";
  import type { CatalogEntry } from "../../worker/protocol";

  let { raw, strings, catalog, onchange }: { raw: bigint; strings: GameStrings; catalog: CatalogEntry[]; onchange: (raw: bigint) => void } = $props();

  const item = $derived(new Item(raw));
  const id = $derived(item.itemId);
  const kind = $derived(getKind(id));
  const remake = $derived(remakeInfo(id));
  const isRecipe = $derived(kind === "Kind_DIYRecipe");
  const isFossilUnknown = $derived(kind === "Kind_FossilUnknown");
  const plain = $derived(!remake && !isRecipe && !isFossilUnknown);
  const fossils = $derived(catalog.filter((c) => c.kind === "Kind_Fossil"));
  const recipes = $derived(recipeIds.map((r) => ({ id: r, name: `${String(r).padStart(3, "0")} · ${strings.getItemNameById(recipeItem(r) ?? 0)}` })));

  function change(fn: (i: Item) => void) {
    const next = item.clone();
    fn(next);
    onchange(next.raw);
  }
  const num = (e: Event) => Math.max(0, Math.floor(Number((e.currentTarget as HTMLInputElement).value) || 0));
</script>

<div class="fields">
  {#if plain}
    <label>Count <input type="number" min="0" max="65535" value={item.count} onchange={(e) => change((i) => (i.count = Math.min(65535, num(e))))} /></label>
    <label>Uses <input type="number" min="0" max="65535" value={item.useCount} onchange={(e) => change((i) => (i.useCount = Math.min(65535, num(e))))} /></label>
    <p class="hint">Raw values. Stacks show count + 1 in game.</p>
  {/if}
  {#if remake}
    <label>Body variant
      <select value={item.bodyType} onchange={(e) => change((i) => (i.bodyType = Number(e.currentTarget.value)))}>
        {#each remake.body as b (b)}<option value={b}>{strings.remakeBody(id)?.[b] || `Variant ${b}`}</option>{/each}
      </select>
    </label>
    {#if remake.fabric.length}
      <label>Fabric pattern
        <select value={item.patternChoice} onchange={(e) => change((i) => (i.patternChoice = Number(e.currentTarget.value)))}>
          {#each remake.fabric as f (f)}<option value={f}>{strings.remakeFabric(id)?.[f] || `Pattern ${f}`}</option>{/each}
        </select>
      </label>
    {/if}
  {/if}
  {#if isRecipe}
    <label>Recipe
      <select value={item.freeParam & 0xffff} onchange={(e) => change((i) => (i.freeParam = Number(e.currentTarget.value)))}>
        {#each recipes as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
    </label>
  {/if}
  {#if isFossilUnknown}
    <label>Fossil
      <select value={item.freeParam & 0xffff} onchange={(e) => change((i) => (i.freeParam = Number(e.currentTarget.value)))}>
        {#each fossils as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
      </select>
    </label>
  {/if}
</div>

<style>
  .fields { display: flex; flex-direction: column; gap: 8px; }
  label { display: flex; flex-direction: column; gap: 2px; font-size: 0.8rem; font-weight: 600; }
  input, select { font: inherit; font-weight: 400; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 5px 8px; }
  .hint { margin: 0; font-size: 0.75rem; color: var(--muted); }
</style>
