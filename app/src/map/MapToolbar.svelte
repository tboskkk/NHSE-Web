<script lang="ts">
  import type { Snippet } from "svelte";
  import ToolIcon from "./ToolIcon.svelte";
  import { TOOL_INFO, type Tool, usesLayer } from "./tools";

  let { mode = $bindable(), layer = $bindable(), tool = $bindable(), view = $bindable(), blocked, right }: {
    mode: "view" | "edit";
    layer: 0 | 1;
    tool: Tool;
    view: "2d" | "3d";
    /** Why editing is unavailable, or null. */
    blocked: string | null;
    /** Right-hand controls (menus). */
    right?: Snippet;
  } = $props();

  const GROUPS = ["items", "structures", "terrain"] as const;
</script>

<div class="bar" role="toolbar" aria-label="Map tools">
  <div class="seg" role="group" aria-label="Mode">
    <button data-testid="view-toggle" class:on={mode === "view"} aria-pressed={mode === "view"} onclick={() => (mode = "view")}>View</button>
    <button data-testid="edit-toggle" class:on={mode === "edit"} aria-pressed={mode === "edit"} disabled={blocked !== null} title={blocked ?? "Edit the island"} onclick={() => (mode = "edit")}>Edit</button>
  </div>
  <div class="seg" role="group" aria-label="View">
    <button data-testid="view2d" class:on={view === "2d"} aria-pressed={view === "2d"} onclick={() => (view = "2d")}>2D</button>
    <button data-testid="view3d" class:on={view === "3d"} aria-pressed={view === "3d"} onclick={() => (view = "3d")}>3D</button>
  </div>

  {#if mode === "edit"}
    <span class="sep" aria-hidden="true"></span>
    {#each GROUPS as g (g)}
      <div class="seg" role="group" aria-label={g === "items" ? "Item tools" : g === "structures" ? "Structure tools" : "Terrain tools"}>
        {#each TOOL_INFO.filter((t) => t.group === g) as t (t.id)}
          <button data-testid="tool-{t.id}" class="tool" class:on={tool === t.id} aria-pressed={tool === t.id} title="{t.label} ({t.key.toUpperCase()}): {t.hint}" onclick={() => (tool = t.id)}>
            <ToolIcon id={t.id} /><span class="label">{t.label}</span>
          </button>
        {/each}
      </div>
    {/each}
    {#if usesLayer(tool)}
      <div class="seg" role="group" aria-label="Item layer">
        <button class:on={layer === 0} aria-pressed={layer === 0} onclick={() => (layer = 0)}>Layer 1</button>
        <button class:on={layer === 1} aria-pressed={layer === 1} onclick={() => (layer = 1)}>Layer 2</button>
      </div>
    {/if}
  {/if}

  <span class="grow"></span>
  {#if blocked}<span class="muted note">{blocked}</span>{/if}
  {@render right?.()}
</div>

<style>
  /* one row at normal widths so entering Edit mode does not resize the map */
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 36px; }
  .grow { flex: 1 1 0; }
  .sep { width: 1px; align-self: stretch; background: var(--border); margin: 2px 2px; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--surface); }
  .seg button { border: 0; border-radius: 0; background: transparent; }
  .seg button:hover:not(:disabled):not(.on) { background: var(--surface-2); }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button.on { background: var(--accent); color: var(--accent-text); }
  .tool { display: inline-flex; align-items: center; gap: 6px; padding: 6px 9px; }
  .note { font-size: 0.85rem; }
  @media (max-width: 1100px) { .tool .label { display: none; } }
</style>
