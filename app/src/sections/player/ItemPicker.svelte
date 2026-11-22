<script lang="ts">
  import { getKind, Item, recipeIds, type GameStrings } from "@nhse/core";
  import { CATEGORIES } from "../../lib/categories";
  import { loadCatalog, loadStrings } from "../../lib/catalog";
  import { app, edit } from "../../lib/state.svelte";
  import { fuzzyFilter } from "../../lib/fuzzy";
  import { AREA_LABEL, sel } from "../../lib/selection.svelte";
  import type { CatalogEntry, PlayerView } from "../../worker/protocol";
  import ItemFields from "./ItemFields.svelte";

  let { p }: { p: PlayerView } = $props();

  const ROW = 36;
  let catalog = $state<CatalogEntry[]>([]);
  let strings = $state<GameStrings | null>(null);
  let query = $state("");
  let cat = $state("all");
  let draft = $state<bigint>(0xfffen);
  let scrollTop = $state(0);
  let listH = $state(360);

  $effect(() => {
    const lang = app.lang;
    loadCatalog(lang).then((c) => (catalog = c));
    loadStrings(lang).then((s) => (strings = s));
  });

  const slot = $derived(sel.slot);
  const current = $derived(slot ? p[slot.area][slot.slot] : null);

  // Reset the draft to the slot's bytes whenever a different slot is selected or the slot changed underneath us.
  $effect(() => {
    if (current) draft = BigInt("0x" + current.raw);
  });

  const inCat = $derived(CATEGORIES.find((c) => c.id === cat)!.test);
  const pool = $derived(cat === "all" ? catalog : catalog.filter((c) => inCat(c.id, c.kind)));
  const results = $derived(fuzzyFilter(pool, query, (c) => c.name, pool.length));
  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 3));
  const last = $derived(Math.min(results.length, Math.ceil((scrollTop + listH) / ROW) + 3));
  const draftId = $derived(Number(draft & 0xffffn));
  const draftName = $derived(strings ? strings.getItemName(new Item(draft)) : "");
  const dirty = $derived(current ? draft !== BigInt("0x" + current.raw) : false);

  function choose(c: CatalogEntry) {
    const it = new Item(BigInt(c.id));
    if (getKind(c.id) === "Kind_DIYRecipe") it.freeParam = recipeIds[0] ?? 0;
    if (getKind(c.id) === "Kind_FossilUnknown") it.freeParam = catalog.find((x) => x.kind === "Kind_Fossil")?.id ?? 0;
    draft = c.id === current?.id ? BigInt("0x" + current.raw) : it.raw;
  }

  async function apply() {
    if (!slot) return;
    await edit({ op: "setItem", player: p.index, area: slot.area, slot: slot.slot, raw: draft.toString(16).padStart(16, "0") });
  }
</script>

{#if slot && current}
  <aside aria-label="Item picker">
    <header>
      <strong>{AREA_LABEL[slot.area]} slot {slot.slot + 1}</strong>
      <button aria-label="Close picker" onclick={() => (sel.slot = null)}>✕</button>
    </header>
    <p class="now">Now: <strong>{current.name}</strong></p>

    <input data-search type="search" placeholder="Search items…  ( / )" bind:value={query} aria-label="Search items" />
    <div class="chips" role="group" aria-label="Category">
      {#each CATEGORIES as c (c.id)}
        <button class="chip" class:on={cat === c.id} aria-pressed={cat === c.id} onclick={() => { cat = c.id; scrollTop = 0; }}>{c.label}</button>
      {/each}
    </div>

    <div class="list" bind:clientHeight={listH} onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}>
      <div style:height="{results.length * ROW}px" style:position="relative">
        {#each results.slice(first, last) as c, i (c.id)}
          <button class="res" class:on={c.id === draftId} style:top="{(first + i) * ROW}px" style:height="{ROW}px" onclick={() => choose(c)}>
            <img src="{import.meta.env.BASE_URL}{c.sprite}" alt="" loading="lazy" />
            <span>{c.name}</span>
          </button>
        {/each}
      </div>
      {#if !results.length}<p class="muted pad">{catalog.length ? "No items match." : "Loading items…"}</p>{/if}
    </div>

    <div class="edit">
      <p class="muted">Selected: <strong>{draftName}</strong></p>
      {#if strings}<ItemFields raw={draft} {strings} {catalog} onchange={(r) => (draft = r)} />{/if}
      <button class="primary" disabled={!dirty} onclick={apply}>Apply to slot</button>
    </div>
  </aside>
{/if}

<style>
  aside { width: 22rem; flex: none; position: sticky; top: 0; align-self: flex-start; max-height: calc(100vh - 5rem); overflow-y: auto; display: flex; flex-direction: column; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  .now { margin: 0; font-size: 0.85rem; }
  input[type="search"] { width: 100%; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { padding: 2px 8px; font-size: 0.75rem; border-radius: 999px; }
  .chip.on { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
  .list { height: 22rem; min-height: 8rem; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); }
  .res { position: absolute; left: 0; right: 0; display: flex; align-items: center; gap: 8px; text-align: left; border: 0; border-radius: 0; padding: 0 8px; background: transparent; }
  .res.on { background: var(--surface-2); font-weight: 600; }
  .res img { width: 28px; height: 28px; object-fit: contain; flex: none; }
  .res span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pad { padding: 8px; margin: 0; }
  .edit { display: flex; flex-direction: column; gap: 8px; }
  .edit p { margin: 0; font-size: 0.85rem; }
  @media (max-width: 900px) { aside { position: fixed; right: 8px; top: 4.5rem; z-index: 30; max-height: calc(100vh - 6rem); width: min(22rem, calc(100vw - 16px)); } }
</style>
