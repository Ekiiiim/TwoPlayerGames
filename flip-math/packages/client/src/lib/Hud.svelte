<script lang="ts">
  import type { ClientView } from '@fm/shared';
  import { onDestroy } from 'svelte';
  import { buzz, leaveRoom } from '../socket';
  import Button from './Button.svelte';
  export let view: ClientView;

  let remaining = 0;
  function tick() {
    remaining = view.deadline ? Math.max(0, Math.ceil((view.deadline - Date.now()) / 1000)) : 0;
  }
  const id = setInterval(tick, 100);
  onDestroy(() => clearInterval(id));
  // view 变化时立刻刷新一次倒计时
  $: view, tick();

  $: oppLetters =
    view.active === 'opp' ? view.selection.map((i) => view.board[i].letter) : [];
  $: myLetters =
    view.active === 'me' ? view.selection.map((i) => view.board[i].letter) : [];
</script>

<div class="flex w-full max-w-[360px] flex-col items-center gap-3">
  <div class="flex w-full items-center justify-between">
    <span class="text-ink">我 <b class="text-accent">{view.scores.me}</b></span>
    <button class="text-xs text-muted underline" on:click={leaveRoom}>退出</button>
    <span class="text-ink">对手 <b class="text-accent">{view.scores.opp}</b></span>
  </div>

  {#if view.target !== null && view.phase !== 'finished'}
    <div class="text-center">
      <span class="text-muted">目标</span>
      <div class="text-4xl font-bold text-accent">{view.target}</div>
    </div>
  {/if}

  {#if view.deadline}<div class="text-lg text-ink">⏱ {remaining}s</div>{/if}

  {#if view.phase === 'preview'}
    <p class="text-muted">记住每格的背面！</p>
  {:else if view.phase === 'buzzing'}
    <Button on:click={buzz}>抢答</Button>
  {:else if view.phase === 'answering'}
    <p class="text-ink">{view.iAmActive ? '你来作答（点 3 张）' : '对方作答中…'}</p>
    {#if myLetters.length}
      <p class="text-center text-accent">已选:<br />{myLetters.join(' ')}</p>
    {/if}
    {#if oppLetters.length}
      <p class="text-center text-muted">对方选择:<br />{oppLetters.join(' ')}</p>
    {/if}
  {:else if view.phase === 'resolve'}
    <p class="text-ink">揭晓…</p>
  {:else if view.phase === 'reveal'}
    <p class="text-muted">记忆提示中…</p>
  {/if}
</div>
