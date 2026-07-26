<script lang="ts">
  import { onMount } from "svelte";
  import type { Card } from "@add-to-fifty/shared";
  import {
    ended,
    leaveRoom,
    playCard,
    roomCode,
    status,
    tryRejoin,
    view,
  } from "./socket";
  import Button from "./lib/Button.svelte";
  import GameOver from "./lib/GameOver.svelte";
  import Lobby from "./lib/Lobby.svelte";
  import PlayingCard from "./lib/PlayingCard.svelte";

  onMount(tryRejoin);

  let selectedKing: Card | null = null;
  let kingDelta = 0;

  $: canPlay = $view?.phase === "playing" && $view.turn === "me";
  $: turnText = canPlay ? "轮到你出牌" : "等待对手出牌";
  $: myGlow = $view?.turn === "me" ? "animate-turn-pulse" : "";
  $: oppGlow = $view?.turn === "opp" ? "animate-turn-pulse" : "";

  function chooseCard(card: Card): void {
    if (!canPlay) return;
    if (card.rank === "K") {
      selectedKing = card;
      kingDelta = 0;
      return;
    }
    selectedKing = null;
    playCard(card.id);
  }

  function playSelectedKing(): void {
    if (selectedKing && canPlay) {
      playCard(selectedKing.id, kingDelta);
      selectedKing = null;
      kingDelta = 0;
    }
  }
</script>

<main class="min-h-screen w-full bg-felt-dark px-4 py-6 text-felt-text">
  <div
    class="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[760px] items-center justify-center"
  >
    {#if $ended}
      <section
        class="flex w-full max-w-[460px] flex-col items-center gap-5 rounded-[16px] border-2 border-gold bg-felt p-7 text-center"
      >
        <p class="text-xl font-bold text-felt-text">{$ended}</p>
        <Button on:click={leaveRoom}>返回大厅</Button>
      </section>
    {:else if $view && $view.phase === "finished"}
      <GameOver view={$view} />
    {:else if $view}
      <section class="mx-auto w-full">
        <div
          class="flex min-h-[680px] flex-col justify-between rounded-[20px] border border-[rgba(217,178,91,0.15)] bg-felt px-[18px] py-[22px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] sm:px-[24px]"
        >
          <div
            class="flex flex-col items-center gap-[12px] border-b border-white/[0.08] pb-[18px]"
          >
            <div class="flex items-center gap-[12px]">
              <div
                class={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-2 border-gold bg-[rgba(217,178,91,0.18)] text-[1rem] font-bold text-gold transition duration-150 ${oppGlow}`}
              >
                对
              </div>
              <div class="flex flex-col gap-[2px]">
                <span class="text-[0.9rem] font-semibold tracking-[0.5px] text-felt-text">
                  对手
                </span>
                <span class="text-[0.78rem] text-gold-muted">
                  {$view.turn === "opp" ? "正在思考" : "等待你出牌"}
                </span>
              </div>
            </div>

            <div class="flex h-[42px] flex-wrap justify-center gap-[6px]">
              {#each Array($view.opponentCardsLeft) as _, i (i)}
                <div
                  class="h-[38px] w-[26px] shrink-0 rounded-[4px] border-2 border-back-border bg-back-bg shadow-[0_3px_8px_rgba(0,0,0,0.3)]"
                ></div>
              {/each}
            </div>
          </div>

          <div class="flex flex-col items-center gap-[16px] px-[8px] py-[22px]">
            <div
              class="rounded-[100px] border border-[rgba(217,178,91,0.3)] bg-black/25 px-[18px] py-[5px] text-[0.82rem] tracking-[1px] text-gold-muted"
            >
              房间 {$roomCode}
            </div>

            <div
              class="grid w-full max-w-[520px] grid-cols-[90px_1fr_90px] items-center gap-[12px] sm:grid-cols-[120px_1fr_120px]"
            >
              <div class="deck-stack relative h-[86px] sm:h-[108px]">
                {#if $view.deckCount > 0}
                  <div
                    class="absolute left-[24px] top-[12px] h-[68px] w-[48px] rotate-[-8deg] rounded-[6px] border-2 border-back-border bg-back-bg shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:left-[36px] sm:h-[88px] sm:w-[62px]"
                    aria-hidden="true"
                  ></div>
                  <div
                    class="absolute left-[20px] top-[8px] h-[68px] w-[48px] rotate-[-3deg] rounded-[6px] border-2 border-back-border bg-back-bg shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:left-[31px] sm:h-[88px] sm:w-[62px]"
                    aria-hidden="true"
                  ></div>
                  <div
                    class="absolute left-[16px] top-[4px] h-[68px] w-[48px] rotate-[3deg] rounded-[6px] border-2 border-back-border bg-back-bg shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:left-[26px] sm:h-[88px] sm:w-[62px]"
                    aria-label="牌堆"
                  ></div>
                {/if}
              </div>

              <div
                class="flex min-h-[118px] flex-col items-center justify-center rounded-[16px] border border-[rgba(217,178,91,0.3)] bg-black/25 px-[18px] py-[18px] text-center"
              >
                <p class="text-[0.85rem] font-semibold text-gold-muted">
                  弃牌堆累积分
                </p>
                <p class="text-[4.2rem] font-black leading-none text-felt-text">
                  {$view.discardTotal}
                </p>
                <p class="mt-[8px] text-[0.95rem] font-semibold text-gold">
                  {turnText}
                </p>
              </div>

              <div class="flex h-[86px] items-center justify-center sm:h-[108px]">
                <Button variant="secondary" on:click={leaveRoom}>离开</Button>
              </div>
            </div>

            {#if selectedKing}
              <div
                class="flex w-full max-w-[420px] flex-col gap-[12px] rounded-[12px] border border-gold bg-black/20 px-[16px] py-[14px]"
              >
                <div class="flex items-center justify-between gap-[12px]">
                  <span class="text-[0.9rem] font-semibold text-felt-text">
                    K 的数值
                  </span>
                  <span class="min-w-[44px] text-right text-[1.6rem] font-black text-gold">
                    {kingDelta}
                  </span>
                </div>
                <input
                  class="w-full cursor-pointer accent-gold"
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  bind:value={kingDelta}
                />
                <div class="flex flex-wrap justify-center gap-[10px]">
                  <Button on:click={playSelectedKing}>确认出 K</Button>
                  <Button variant="secondary" on:click={() => (selectedKing = null)}>
                    取消
                  </Button>
                </div>
              </div>
            {/if}

            {#if $status}
              <p class="text-center text-[0.85rem] text-danger">{$status}</p>
            {/if}
          </div>

          <div
            class="flex flex-col items-center gap-[12px] border-t border-white/[0.08] pt-[18px]"
          >
            <div class="flex flex-row-reverse items-center gap-[12px]">
              <div
                class={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-2 border-gold bg-[rgba(217,178,91,0.25)] text-[1rem] font-bold text-gold transition duration-150 ${myGlow}`}
              >
                我
              </div>
              <div class="flex flex-col items-end gap-[2px]">
                <span class="text-[0.9rem] font-semibold tracking-[0.5px] text-felt-text">
                  我
                </span>
                <span class="text-[0.78rem] text-gold-muted">
                  J=-10 · Q=0 · K任选
                </span>
              </div>
            </div>

            <div class="flex w-full flex-wrap justify-center gap-[8px] pb-[4px] pt-[8px] sm:gap-[10px]">
              {#each $view.myHand as card (card.id)}
                <PlayingCard
                  {card}
                  selected={selectedKing?.id === card.id}
                  disabled={!canPlay}
                  on:click={() => chooseCard(card)}
                />
              {/each}
            </div>
          </div>
        </div>
      </section>
    {:else}
      <Lobby />
    {/if}
  </div>
</main>
