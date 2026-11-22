<script lang="ts">
  import { app, openDrop, redo, save, undo, unsavedCount } from "./lib/state.svelte";
  import EmptyState from "./components/EmptyState.svelte";
  import HashWarning from "./components/HashWarning.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import MapSection from "./sections/map/MapSection.svelte";
  import PlayerSection from "./sections/player/PlayerSection.svelte";
  import Toast from "./components/Toast.svelte";
  import TopBar from "./components/TopBar.svelte";

  let dragging = $state(false);

  function onkeydown(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement | null)?.matches?.("input, textarea, select, [contenteditable]");
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "s") {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur(); // commit a field still being typed in
      if (app.loaded && !e.repeat) save();
    }
    else if (mod && k === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k === "y" && !typing) { e.preventDefault(); redo(); }
    else if (e.key === "/" && !typing && !mod) {
      const el = document.querySelector<HTMLInputElement>("[data-search]");
      if (el) { e.preventDefault(); el.focus(); }
    }
  }

  function ondrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer) openDrop(e.dataTransfer);
  }
</script>

<svelte:window
  onbeforeunload={(e) => { if (app.loaded && unsavedCount() > 0) e.preventDefault(); }}
  {onkeydown}
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={(e) => { if (!e.relatedTarget) dragging = false; }}
  {ondrop}
/>

{#if app.loaded}
  <div class="shell">
    <TopBar />
    <HashWarning />
    <div class="body">
      <Sidebar />
      <main id="section">
        {#if app.section === "player"}<PlayerSection />{:else if app.section === "map"}<MapSection />{/if}
      </main>
    </div>
  </div>
{:else}
  <EmptyState />
{/if}

{#if dragging}<div class="drop-overlay">Drop your save folder or .zip</div>{/if}
<Toast />

<style>
  .shell { display: flex; flex-direction: column; height: 100vh; }
  .body { display: flex; flex: 1; min-height: 0; }
  main { flex: 1; overflow: auto; padding: 16px; }
  .drop-overlay { position: fixed; inset: 0; display: grid; place-items: center; font-size: 1.4rem; background: color-mix(in srgb, var(--accent) 25%, transparent); border: 4px dashed var(--accent); z-index: 40; pointer-events: none; }
  @media (max-width: 640px) { .body { flex-direction: column; } }
</style>
