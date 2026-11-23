<script lang="ts">
  import type { Tool } from "./tools";
  let { id }: { id: Tool } = $props();
</script>

<!-- 16px line icons (stroke follows the text colour) -->
<svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if id === "place"}
    <path d="M8 3v10M3 8h10" />
  {:else if id === "erase"}
    <path d="M9.5 3.5l3.5 3.5-5.5 5.5H4.8L3 10.7zM6.8 6.2l3.5 3.5M8 12.5h5" />
  {:else if id === "rect"}
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M5.5 8h5M8 5.5v5" />
  {:else if id === "clearRect"}
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke-dasharray="2 2" /><path d="M6 6l4 4M10 6l-4 4" />
  {:else if id === "eyedropper"}
    <path d="M10.5 2.5l3 3-2 2-3-3zM8.5 4.5l-5 5V12.5H6.5l5-5M3.5 12.5l-1 1" />
  {:else if id === "building"}
    <path d="M2.5 7.5L8 3l5.5 4.5M4 6.7V13h8V6.7M6.8 13V9.5h2.4V13" />
  {:else}
    <path d="M1.5 12.5L6 5l3 4.5 1.8-2.5 3.7 5.5zM9.5 4.2a1.2 1.2 0 100-.01" />
  {/if}
</svg>

<style>
  .icon { flex: none; display: block; }
</style>
