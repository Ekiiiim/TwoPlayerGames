<script lang="ts">
  import { createRoom, joinRoom, roomCode, status } from '../socket';
  import Button from './Button.svelte';
  let code = '';
</script>

<div class="flex w-full max-w-[360px] flex-col items-center gap-6 rounded-[16px] border border-line bg-panel p-8">
  <h1 class="text-3xl font-bold text-accent">翻牌数式</h1>

  {#if $roomCode}
    <p class="text-muted">房间号</p>
    <p class="font-mono text-3xl tracking-[6px] text-accent">{$roomCode}</p>
    <p class="text-muted">等待对手加入…</p>
  {:else}
    <Button class="w-full" on:click={createRoom}>创建房间</Button>
    <div class="flex w-full items-center gap-2">
      <input
        class="flex-1 rounded-[10px] border border-line bg-bg px-3 py-2 uppercase tracking-widest text-ink outline-none focus:border-accent"
        maxlength="6"
        bind:value={code}
        placeholder="房间号"
      />
      <Button on:click={() => joinRoom(code.trim().toUpperCase())}>加入</Button>
    </div>
  {/if}

  {#if $status}<p class="text-danger">{$status}</p>{/if}
</div>
