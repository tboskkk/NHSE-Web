<script lang="ts">
  import type { ItemArea } from "@nhse/core";
  import type { ItemView } from "../../worker/protocol";

  let { item, area, slot, locked, selected, onselect, onmenu, ondropped }: {
    item: ItemView; area: ItemArea; slot: number; locked: boolean; selected: boolean;
    onselect: () => void; onmenu: (x: number, y: number) => void; ondropped: (from: { area: ItemArea; slot: number }) => void;
  } = $props();

  const empty = $derived(item.id === 0xfffe);
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressed = false;
  let over = $state(false);

  function down(e: PointerEvent) {
    if (e.pointerType === "mouse") return;
    longPressed = false;
    const x = e.clientX, y = e.clientY;
    pressTimer = setTimeout(() => { longPressed = true; onmenu(x, y); }, 550);
  }
  const cancel = () => clearTimeout(pressTimer);
</script>

<button
  type="button"
  class="slot"
  class:locked class:selected class:empty class:over
  title="{item.name}{locked ? ' (locked slot)' : ''}"
  aria-label="{area} slot {slot + 1}: {item.name}"
  draggable="true"
  onclick={() => { if (!longPressed) onselect(); longPressed = false; }}
  oncontextmenu={(e) => { e.preventDefault(); onmenu(e.clientX, e.clientY); }}
  onpointerdown={down} onpointerup={cancel} onpointerleave={cancel} onpointercancel={cancel}
  ondragstart={(e) => { e.dataTransfer?.setData("application/x-nhse-slot", JSON.stringify({ area, slot })); e.dataTransfer && (e.dataTransfer.effectAllowed = "move"); }}
  ondragover={(e) => { if (e.dataTransfer?.types.includes("application/x-nhse-slot")) { e.preventDefault(); e.stopPropagation(); over = true; } }}
  ondragleave={() => (over = false)}
  ondrop={(e) => {
    over = false;
    const raw = e.dataTransfer?.getData("application/x-nhse-slot");
    if (!raw) return;
    e.preventDefault(); e.stopPropagation();
    ondropped(JSON.parse(raw));
  }}
>
  {#if !empty}<img src="{import.meta.env.BASE_URL}{item.sprite}" alt="" loading="lazy" draggable="false" />{/if}
  {#if item.count > 0 && !empty}<span class="badge">{item.count + 1}</span>{/if}
</button>

<style>
  .slot { position: relative; width: 100%; aspect-ratio: 1; padding: 2px; display: grid; place-items: center; background: var(--surface-2); }
  .slot.empty { background: var(--surface); border-style: dashed; }
  .slot.locked { opacity: 0.45; }
  .slot.selected { outline: 2px solid var(--accent); outline-offset: -2px; }
  .slot.over { background: color-mix(in srgb, var(--accent) 30%, var(--surface-2)); }
  img { width: 100%; height: 100%; object-fit: contain; image-rendering: auto; pointer-events: none; }
  .badge { position: absolute; right: 2px; bottom: 1px; font-size: 0.65rem; line-height: 1; background: var(--bg); border-radius: 4px; padding: 1px 3px; font-variant-numeric: tabular-nums; }
</style>
