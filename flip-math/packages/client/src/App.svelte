<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { view, ended, roundResult, tryRejoin, leaveRoom } from "./socket";
  import Lobby from "./lib/Lobby.svelte";
  import Board from "./lib/Board.svelte";
  import Hud from "./lib/Hud.svelte";
  import Selection from "./lib/Selection.svelte";
  import GameOver from "./lib/GameOver.svelte";
  import Button from "./lib/Button.svelte";

  onMount(tryRejoin);
</script>

{#if $roundResult}
  <div
    class="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-[12px] border-2 border-accent bg-panel px-6 py-3 text-center text-lg font-semibold text-accent"
    transition:fade={{ duration: 200 }}
  >
    {$roundResult}
  </div>
{/if}

<div
  class="flex min-h-screen w-full flex-col items-center justify-center gap-6"
>
  {#if $ended}
    <div
      class="flex flex-col items-center gap-7 rounded-[16px] border-2 border-accent bg-panel px-14 py-12 text-center"
    >
      <p class="text-[1.4rem] font-semibold leading-[1.5] text-ink">{$ended}</p>
      <Button on:click={leaveRoom}>返回大厅</Button>
    </div>
  {:else if $view && $view.phase === "finished"}
    <GameOver view={$view} />
  {:else if $view}
    <div class="flex w-full max-w-[760px] flex-col items-center gap-5">
      <Hud view={$view} />
      <div class="flex w-full items-start justify-center gap-6">
        <Board view={$view} />
        <!-- 宽屏:已选放棋盘右侧 -->
        <div
          class="hidden w-[200px] shrink-0 rounded-[12px] border border-line bg-panel p-4 md:block"
        >
          <Selection view={$view} />
        </div>
      </div>
      <!-- 窄屏:作答/揭晓时已选显示在棋盘下方(resolve 时随之翻面) -->
      {#if ($view.phase === "answering" || $view.phase === "resolve") && $view.active}
        <div class="md:hidden">
          <Selection view={$view} />
        </div>
      {/if}
    </div>
  {:else}
    <Lobby />
  {/if}
</div>
