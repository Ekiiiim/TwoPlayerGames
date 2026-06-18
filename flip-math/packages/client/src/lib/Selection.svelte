<script lang="ts">
  import type { ClientView } from '@fm/shared';
  export let view: ClientView;
  // 谁在作答就列谁的已选字母(反面隐藏);没人作答则空。
  $: letters = view.active ? view.selection.map((i) => view.board[i].letter) : [];
  $: title = view.active === 'me' ? '你的选择' : view.active === 'opp' ? '对方选择' : '已选';
</script>

<div class="flex flex-col gap-3">
  <div class="text-sm tracking-widest text-muted">{title}</div>
  <div class="flex flex-col gap-2">
    {#each [0, 1, 2] as slot}
      <div class="flex items-center gap-3">
        <span class="w-4 text-xs text-muted">{slot + 1}</span>
        <span class="text-3xl font-bold {letters[slot] ? 'text-accent' : 'text-line'}">
          {letters[slot] ?? '·'}
        </span>
      </div>
    {/each}
  </div>
  <div class="text-xs text-muted">选满 3 张才翻面</div>
</div>
