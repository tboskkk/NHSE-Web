<script lang="ts">
  import { app, openFiles, openFolder, supportsFsAccess } from "../lib/state.svelte";

  let folderInput: HTMLInputElement;
  let zipInput: HTMLInputElement;

  const pick = (e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    if (el.files?.length) openFiles(el.files);
    el.value = "";
  };
</script>

<section class="empty">
  <h1>NHSE Web</h1>
  <p class="muted">Edit your Animal Crossing: New Horizons save in the browser. Your save never leaves this computer.</p>

  {#if app.error}<p class="error" role="alert">{app.error}</p>{/if}

  <div class="actions">
    {#if supportsFsAccess()}
      <button class="primary" disabled={app.busy} onclick={openFolder}>Open save folder</button>
    {:else}
      <button class="primary" disabled={app.busy} onclick={() => folderInput.click()}>Open save folder</button>
      <input bind:this={folderInput} class="visually-hidden" type="file" webkitdirectory multiple onchange={pick} />
    {/if}
    <button disabled={app.busy} onclick={() => zipInput.click()}>Open .zip</button>
    <input bind:this={zipInput} class="visually-hidden" type="file" accept=".zip" onchange={pick} />
  </div>
  <p class="muted drop">…or drop a save folder or .zip anywhere on this page.</p>
</section>

<style>
  .empty { max-width: 34rem; margin: 18vh auto 0; padding: 0 16px; text-align: center; }
  h1 { font-size: 2rem; margin: 0 0 0.5rem; }
  .actions { display: flex; gap: 12px; justify-content: center; margin: 1.5rem 0 1rem; flex-wrap: wrap; }
  .error { color: var(--error); font-weight: 600; }
  .drop { font-size: 0.9rem; }
</style>
