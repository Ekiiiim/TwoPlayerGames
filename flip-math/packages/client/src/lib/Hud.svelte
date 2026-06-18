<script lang="ts">
  import type { ClientView } from '@fm/shared';
  import { onDestroy } from 'svelte';
  import { buzz, ready, leaveRoom } from '../socket';
  import Button from './Button.svelte';
  import Selection from './Selection.svelte';
  export let view: ClientView;
  // 窄屏 true:在 Hud 内显示已选;宽屏布局传 false(右栏单独放 Selection)。
  export let showSelection = true;

  let remaining = 0;
  let confirmQuit = false;
  function tick() {
    remaining = view.deadline ? Math.max(0, Math.ceil((view.deadline - Date.now()) / 1000)) : 0;
  }
  const id = setInterval(tick, 100);
  onDestroy(() => clearInterval(id));
  // view 变化时立刻刷新一次倒计时
  $: view, tick();
</script>

<div class="flex w-full max-w-[420px] flex-col items-center gap-4">
  <div class="flex w-full items-center justify-between text-xl">
    <span class="text-ink">我 <b class="text-2xl text-accent">{view.scores.me}</b></span>
    {#if confirmQuit}
      <span class="flex items-center gap-3 text-sm">
        <button class="text-danger underline" on:click={leaveRoom}>确认退出</button>
        <button class="text-muted underline" on:click={() => (confirmQuit = false)}>取消</button>
      </span>
    {:else}
      <button class="text-sm text-muted underline" on:click={() => (confirmQuit = true)}>退出</button>
    {/if}
    <span class="text-ink">对手 <b class="text-2xl text-accent">{view.scores.opp}</b></span>
  </div>

  {#if view.target !== null && view.phase !== 'finished'}
    <div class="text-center">
      <div class="text-sm tracking-widest text-muted">目标</div>
      <div class="text-[60px] font-bold leading-none text-accent">{view.target}</div>
    </div>
  {/if}

  {#if view.deadline && view.phase !== 'countdown'}
    <div class="text-xl text-ink">⏱ {remaining}s</div>
  {/if}

  {#if view.phase === 'ready'}
    {#if view.ready.me}
      <p class="text-lg text-ink">已准备，等待对方…</p>
    {:else}
      <Button on:click={ready}>准备</Button>
    {/if}
    <p class="text-sm text-muted">
      {view.ready.me ? '✓ 你' : '○ 你'} ｜ {view.ready.opp ? '✓ 对方' : '○ 对方'}
    </p>
  {:else if view.phase === 'preview'}
    <p class="text-lg text-muted">记住每格的背面！</p>
  {:else if view.phase === 'countdown'}
    <div class="text-[64px] font-bold leading-none text-accent">{remaining}</div>
  {:else if view.phase === 'buzzing'}
    <Button on:click={buzz}>抢答</Button>
  {:else if view.phase === 'answering'}
    <p class="text-lg text-ink">{view.iAmActive ? '你来作答（点 3 张组成算式）' : '对方作答中…'}</p>
    {#if showSelection && view.active}
      <Selection {view} />
    {/if}
  {:else if view.phase === 'resolve'}
    <p class="text-lg text-ink">揭晓…</p>
  {:else if view.phase === 'reveal'}
    <p class="text-lg text-muted">记忆提示中…</p>
  {/if}
</div>
