<script lang="ts">
  import type { ClientView, Cell, Operator } from '@fm/shared';
  import { selectCell } from '../socket';
  export let view: ClientView;

  const opSym: Record<Operator, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  function backText(cell: Cell): string {
    return cell.back.kind === 'num' ? String(cell.back.value) : opSym[cell.back.op];
  }
  // preview 阶段或 revealedCells 中的格子显示反面,否则显示字母。
  function showsBack(i: number): boolean {
    return view.phase === 'preview' || view.revealedCells.includes(i);
  }
  $: canPick = view.phase === 'answering' && view.iAmActive;
  function onCell(i: number) {
    if (canPick) selectCell(i);
  }
</script>

<div class="grid grid-cols-4 gap-2">
  {#each view.board as cell (cell.index)}
    {@const sel = view.selection.indexOf(cell.index)}
    <button
      class="relative flex h-[68px] w-[68px] items-center justify-center rounded-[12px] border-2 text-2xl font-bold transition
             {showsBack(cell.index)
               ? 'border-accent bg-back text-accent'
               : 'border-line bg-card text-ink'}
             {sel >= 0 ? 'ring-4 ring-accent' : ''}
             {canPick ? 'cursor-pointer hover:border-accent' : 'cursor-default'}"
      on:click={() => onCell(cell.index)}
      disabled={!canPick}
    >
      {showsBack(cell.index) ? backText(cell) : cell.letter}
      {#if sel >= 0}
        <span class="absolute right-1 top-1 text-xs text-accent">{sel + 1}</span>
      {/if}
    </button>
  {/each}
</div>
