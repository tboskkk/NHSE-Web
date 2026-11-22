<script lang="ts">
  import { app } from "../lib/state.svelte";
  const bad = $derived(app.loaded?.invalidHashes ?? []);
</script>

{#if bad.length && !app.hashWarningDismissed}
  <div class="warn" role="alert">
    <div>
      <strong>This save has {bad.length} invalid hash {bad.length === 1 ? "region" : "regions"}.</strong>
      The game may have refused to load it before. They are recalculated when you save.
      <ul>{#each bad as b, i (i)}<li><code>{b.path}</code> at 0x{b.start.toString(16)}</li>{/each}</ul>
    </div>
    <button onclick={() => (app.hashWarningDismissed = true)} aria-label="Dismiss">✕</button>
  </div>
{/if}

<style>
  .warn { display: flex; gap: 12px; justify-content: space-between; padding: 8px 16px; background: var(--warn-bg); color: var(--warn-text); }
  ul { margin: 4px 0 0; padding-left: 20px; }
  button { background: transparent; border-color: transparent; }
</style>
