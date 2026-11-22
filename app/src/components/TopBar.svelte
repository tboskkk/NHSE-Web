<script lang="ts">
  import { app, redo, undo, unsavedCount } from "../lib/state.svelte";
  import SaveMenu from "./SaveMenu.svelte";
  let showChanges = $state(false);
</script>

<header>
  <strong class="island">{app.loaded?.island}</strong>
  <span class="badge" title="Game version of this save">{app.loaded?.revisionLabel}</span>
  <span class="spacer"></span>
  <button onclick={undo} disabled={!app.history.length} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
  <button onclick={redo} disabled={!app.redoable} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
  <div class="changes">
    <button onclick={() => (showChanges = !showChanges)} aria-expanded={showChanges} disabled={!app.history.length}>
      {unsavedCount()} unsaved {unsavedCount() === 1 ? "change" : "changes"}
    </button>
    {#if showChanges && app.history.length}
      <ol class="pop">
        {#each app.history as h, i (i)}<li>{h}</li>{/each}
      </ol>
    {/if}
  </div>
  <SaveMenu />
</header>

<style>
  header { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .island { font-size: 1.05rem; }
  .badge { font-size: 0.75rem; border: 1px solid var(--border); background: var(--surface-2); border-radius: 999px; padding: 1px 8px; }
  .spacer { flex: 1; }
  .changes { position: relative; }
  .pop { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; margin: 0; padding: 8px 8px 8px 28px; min-width: 18rem; max-height: 50vh; overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 6px 20px #0003; }
</style>
