<script lang="ts">
  import type { ClientView } from "@fm/shared";
  import { backText } from "./cellFace";
  export let view: ClientView;
  // 谁在作答就展示谁已选的牌;没人作答则空。
  $: cells = view.active ? view.selection.map((i) => view.board[i]) : [];
  $: title =
    view.active === "me"
      ? "你的选择"
      : view.active === "opp"
        ? "对方选择"
        : "已选";
  // resolve 阶段已选三张随棋盘一起翻面(revealedCells 同时包含这三格)。
  function showsBack(index: number): boolean {
    return view.revealedCells.includes(index);
  }
</script>

<div class="flex flex-col items-center gap-3">
  <div class="text-sm tracking-widest text-muted">{title}</div>
  <div class="flex items-center gap-2">
    {#each [0, 1, 2] as slot}
      {@const cell = cells[slot]}
      {#if cell}
        <div
          class="flex h-12 w-12 items-center justify-center rounded-[10px] border-2 text-2xl font-bold transition
                 {showsBack(cell.index)
            ? 'border-accent bg-back text-accent'
            : 'border-accent bg-card text-ink'}"
        >
          {showsBack(cell.index) ? backText(cell) : cell.letter}
        </div>
      {:else}
        <div
          class="h-12 w-12 rounded-[10px] border-2 border-dashed border-line"
        ></div>
      {/if}
    {/each}
  </div>
</div>
