<script lang="ts">
  let { x, y, canClear, onclear, onduplicate, onfillrow, onfillall, onclose }: {
    x: number; y: number; canClear: boolean;
    onclear: () => void; onduplicate: () => void; onfillrow: () => void; onfillall: () => void; onclose: () => void;
  } = $props();
  const run = (f: () => void) => () => { onclose(); f(); };
</script>

<svelte:window onclick={onclose} onkeydown={(e) => e.key === "Escape" && onclose()} />
<div class="menu" role="menu" style:left="{Math.min(x, innerWidth - 190)}px" style:top="{Math.min(y, innerHeight - 170)}px">
  <button role="menuitem" disabled={!canClear} onclick={run(onclear)}>Clear</button>
  <button role="menuitem" disabled={!canClear} onclick={run(onduplicate)}>Duplicate to next empty slot</button>
  <button role="menuitem" disabled={!canClear} onclick={run(onfillrow)}>Fill row</button>
  <button role="menuitem" disabled={!canClear} onclick={run(onfillall)}>Fill all empty slots</button>
</div>

<style>
  .menu { position: fixed; z-index: 60; display: flex; flex-direction: column; min-width: 11rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; box-shadow: 0 6px 20px #0004; }
  .menu button { border-color: transparent; text-align: left; }
</style>
