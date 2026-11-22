<script lang="ts">
  import type { Tool } from "./tools";

  let { mode = $bindable(), layer = $bindable(), tool = $bindable(), blocked }: {
    mode: "view" | "edit";
    layer: 0 | 1;
    tool: Tool;
    /** Why editing is unavailable, or null. */
    blocked: string | null;
  } = $props();

  const TOOLS: [Tool, string, string][] = [
    ["place", "Place", "P"], ["erase", "Erase", "E"], ["rect", "Fill area", "R"], ["clearRect", "Clear area", "C"], ["eyedropper", "Pick", "I"],
  ];
</script>

<div class="bar" role="toolbar" aria-label="Map tools">
  <div class="seg" role="group" aria-label="Mode">
    <button data-testid="view-toggle" class:on={mode === "view"} aria-pressed={mode === "view"} onclick={() => (mode = "view")}>View</button>
    <button data-testid="edit-toggle" class:on={mode === "edit"} aria-pressed={mode === "edit"} disabled={blocked !== null} title={blocked ?? "Edit items"} onclick={() => (mode = "edit")}>Edit</button>
  </div>
  {#if mode === "edit"}
    <div class="seg" role="group" aria-label="Item layer">
      <button class:on={layer === 0} aria-pressed={layer === 0} onclick={() => (layer = 0)}>Layer 1</button>
      <button class:on={layer === 1} aria-pressed={layer === 1} onclick={() => (layer = 1)}>Layer 2</button>
    </div>
    <div class="seg" role="group" aria-label="Tool">
      {#each TOOLS as [id, label, key] (id)}
        <button data-testid="tool-{id}" class:on={tool === id} aria-pressed={tool === id} title="{label} ({key})" onclick={() => (tool = id)}>{label}</button>
      {/each}
    </div>
  {/if}
  {#if blocked}<span class="muted">{blocked}</span>{/if}
</div>

<style>
  .bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .seg button { border: 0; border-radius: 0; }
  .seg button.on { background: var(--accent); color: var(--accent-text); }
</style>
