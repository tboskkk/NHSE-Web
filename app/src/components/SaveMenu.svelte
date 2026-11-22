<script lang="ts">
  import { app, canSaveInPlace, saveInPlace, saveZip } from "../lib/state.svelte";
  let open = $state(false);
  const run = (fn: () => void) => () => { open = false; fn(); };
</script>

<div class="wrap">
  <button class="primary" disabled={app.busy} aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}>Save ▾</button>
  {#if open}
    <div class="menu" role="menu">
      {#if canSaveInPlace()}
        <button role="menuitem" onclick={run(saveInPlace)}>Save in place</button>
      {/if}
      <button role="menuitem" onclick={run(saveZip)}>Save as zip</button>
    </div>
  {/if}
</div>

<style>
  .wrap { position: relative; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); display: flex; flex-direction: column; min-width: 10rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; z-index: 20; box-shadow: 0 6px 20px #0003; }
  .menu button { border-color: transparent; text-align: left; }
</style>
