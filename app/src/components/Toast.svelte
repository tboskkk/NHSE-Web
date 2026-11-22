<script lang="ts">
  import { app } from "../lib/state.svelte";
</script>

{#if app.toast}<div class="toast" role="status">{app.toast}</div>{/if}

<style>
  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--text); color: var(--bg); padding: 8px 16px; border-radius: var(--radius); z-index: 50; }
</style>
