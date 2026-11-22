<script lang="ts">
  import { Item, type GameStrings } from "@nhse/core";
  import { loadCatalog, loadStrings } from "../lib/catalog";
  import { fuzzyFilter } from "../lib/fuzzy";
  import { app } from "../lib/state.svelte";
  import ItemFields from "../sections/player/ItemFields.svelte";
  import type { CatalogEntry } from "../worker/protocol";

  let { raw = $bindable() }: { raw: bigint } = $props();

  let catalog = $state<CatalogEntry[]>([]);
  let strings = $state<GameStrings | null>(null);
  let query = $state("");
  let open = $state(false);

  $effect(() => {
    const lang = app.lang;
    loadCatalog(lang).then((c) => (catalog = c));
    loadStrings(lang).then((s) => (strings = s));
  });

  const results = $derived(fuzzyFilter(catalog, query, (c) => c.name, 40));
  const name = $derived(strings ? strings.getItemName(new Item(raw)) : "…");
  const sprite = $derived(catalog.find((c) => c.id === Number(raw & 0xffffn))?.sprite);
</script>

<section aria-label="Brush">
  <button class="chip" data-testid="brush-chip" onclick={() => (open = !open)} aria-expanded={open}>
    {#if sprite}<img src="{import.meta.env.BASE_URL}{sprite}" alt="" />{/if}
    <span>Brush: <strong>{name}</strong></span>
  </button>
  {#if open}
    <div class="picker">
      <input type="search" placeholder="Search items…" bind:value={query} aria-label="Search brush item" />
      <ul>
        {#each results as c (c.id)}
          <li><button onclick={() => { raw = BigInt(c.id); open = false; query = ""; }}><img src="{import.meta.env.BASE_URL}{c.sprite}" alt="" loading="lazy" /> {c.name}</button></li>
        {/each}
        {#if !results.length}<li class="muted">{catalog.length ? "No items match." : "Loading items…"}</li>{/if}
      </ul>
    </div>
  {/if}
  {#if strings && raw !== 0xfffen}<ItemFields {raw} {strings} {catalog} onchange={(r) => (raw = r)} />{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 6px; }
  .chip { display: inline-flex; gap: 6px; align-items: center; justify-self: start; }
  img { width: 22px; height: 22px; object-fit: contain; }
  .picker { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px; max-height: 16rem; overflow-y: auto; }
  input { width: 100%; }
  ul { list-style: none; margin: 6px 0 0; padding: 0; }
  li button { width: 100%; text-align: left; display: flex; gap: 6px; align-items: center; border: 0; background: transparent; }
  li button:hover { background: var(--surface-2); }
</style>
