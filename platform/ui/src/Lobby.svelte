<script lang="ts">
  // 四个游戏共用的大厅。传进来的是普通值不是 store —— 这个组件不认识
  // 会话层,$roomCode / $t 在各游戏的调用点解开。所以 @tpg/ui 只用到
  // @tpg/client 的一个类型,不依赖它的运行时。
  import type { LobbyDict } from "@tpg/client";
  import Button from "./Button.svelte";

  export let title: string;
  /** 空字符串就不渲染这一行 —— flip-math 没有副标题。 */
  export let subtitle = "";
  export let copy: LobbyDict;
  /** 已经翻好的文案,组件不碰词典。 */
  export let statusText: string | null = null;
  export let roomCode: string | null = null;
  export let onCreate: () => void;
  export let onJoin: (code: string) => void;
  export let onClose: () => void;

  let code = "";
  let confirmClose = false;

  // 房间码固定 6 位,不到 6 位按钮就按不动 —— 比发出去再收 ROOM_NOT_FOUND 干净。
  $: canJoin = code.trim().length === 6;

  function submitJoin(): void {
    if (canJoin) onJoin(code);
  }
</script>

<section
  class="flex w-full max-w-[420px] flex-col items-center gap-5 rounded-ui-panel border border-ui-line bg-ui-surface p-8 shadow-ui-panel"
>
  <div class="flex flex-col items-center gap-2 text-center">
    <h1 class="text-2xl font-black text-ui-accent">{title}</h1>
    {#if subtitle}
      <p class="text-sm leading-6 text-ui-muted">{subtitle}</p>
    {/if}
  </div>

  {#if roomCode}
    <div
      class="flex w-full flex-col items-center gap-1 rounded-ui-control border border-ui-line px-6 py-4 text-center"
    >
      <span class="text-xs uppercase tracking-[1px] text-ui-muted">
        {copy.roomCode}
      </span>
      <strong class="text-4xl font-black tracking-[6px] text-ui-accent">
        {roomCode}
      </strong>
      <span class="mt-1 text-sm text-ui-muted">{copy.waitingOpponent}</span>
    </div>

    <!-- 两步确认:房里可能已经有对手在等,一点就拆太容易误触。
         原来只有 flip-math 有这一步,四个统一成有。 -->
    {#if confirmClose}
      <div class="flex w-full items-center justify-center gap-3">
        <Button
          variant="danger"
          on:click={() => {
            confirmClose = false;
            onClose();
          }}
        >
          {copy.confirmClose}
        </Button>
        <Button variant="ghost" on:click={() => (confirmClose = false)}>
          {copy.cancel}
        </Button>
      </div>
    {:else}
      <Button
        variant="ghost"
        class="w-full"
        on:click={() => (confirmClose = true)}
      >
        {copy.closeRoom}
      </Button>
    {/if}
  {:else}
    <Button class="w-full" on:click={onCreate}>{copy.createRoom}</Button>

    <form
      class="flex w-full items-center gap-2"
      on:submit|preventDefault={submitJoin}
    >
      <input
        class="min-h-[44px] min-w-0 flex-1 rounded-ui-control border border-ui-line bg-transparent px-3 text-center text-base font-semibold uppercase tracking-[4px] text-ui-ink outline-none transition focus:border-ui-accent placeholder:text-sm placeholder:font-normal placeholder:tracking-[1px] placeholder:text-ui-muted"
        bind:value={code}
        maxlength="6"
        placeholder={copy.codePlaceholder}
      />
      <Button variant="secondary" type="submit" disabled={!canJoin}>
        {copy.join}
      </Button>
    </form>
  {/if}

  {#if statusText}
    <p class="text-center text-sm text-ui-danger">{statusText}</p>
  {/if}
</section>
