<script lang="ts">
  import { createRoom, joinRoom, leaveRoom, roomCode, status } from "../socket";
  import Button from "./Button.svelte";

  let code = "";

  function submitJoin(): void {
    if (code.trim()) joinRoom(code);
  }
</script>

<section
  class="flex w-full max-w-[420px] flex-col gap-5 rounded-[8px] border border-line bg-panel p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
>
  <div class="space-y-2">
    <h1 class="text-2xl font-bold text-ink">Add to Fifty</h1>
    <p class="text-sm leading-6 text-muted">
      轮流出牌并补牌，谁把弃牌堆累积分推到 50 或以上，谁输。
    </p>
  </div>

  {#if $roomCode}
    <div class="rounded-[8px] border border-accent bg-white p-4 text-center">
      <p class="text-sm font-semibold text-muted">房间码</p>
      <p class="mt-1 text-4xl font-black tracking-[0.12em] text-ink">
        {$roomCode}
      </p>
      <p class="mt-2 text-sm text-muted">等待第二位玩家加入</p>
    </div>
    <Button variant="danger" on:click={leaveRoom}>解散房间</Button>
  {:else}
    <Button on:click={createRoom}>创建房间</Button>

    <form class="flex gap-2" on:submit|preventDefault={submitJoin}>
      <input
        class="min-h-[44px] min-w-0 flex-1 rounded-[8px] border border-line bg-white px-3 text-center text-base font-semibold uppercase tracking-[0.08em] text-ink outline-none focus:border-accent"
        bind:value={code}
        maxlength="6"
        placeholder="房间码"
      />
      <Button variant="secondary" disabled={!code.trim()}>加入</Button>
    </form>
  {/if}

  {#if $status}
    <p
      class="rounded-[8px] border border-danger/40 bg-white px-3 py-2 text-sm text-danger"
    >
      {$status}
    </p>
  {/if}
</section>
