<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, badge = "", children }: { label: string; badge?: string; children: Snippet } = $props();
  let open = $state(false);
  let root: HTMLDivElement;

  function outside(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Escape" && open) open = false;
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={key} />

<div class="menu" bind:this={root}>
  <button class="trigger" aria-haspopup="true" aria-expanded={open} onclick={() => (open = !open)}>
    {label}{#if badge}<span class="badge">{badge}</span>{/if}<span class="caret" aria-hidden="true">▾</span>
  </button>
  <!-- always in the DOM (just hidden) so file inputs and status text stay available to tests and assistive tech -->
  <div class="pop" hidden={!open}>{@render children()}</div>
</div>

<style>
  .menu { position: relative; }
  .trigger { display: inline-flex; align-items: center; gap: 6px; }
  .caret { font-size: 0.7em; opacity: 0.7; }
  .badge { background: var(--accent); color: var(--accent-text); border-radius: 999px; padding: 0 7px; font-size: 0.75rem; line-height: 1.4; }
  .pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 15rem; display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); }
  .pop[hidden] { display: none; }
</style>
