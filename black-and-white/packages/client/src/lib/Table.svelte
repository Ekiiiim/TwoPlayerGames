<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { ClientView } from "@bw/shared";
  import Hand from "./Hand.svelte";
  import Chip from "./Chip.svelte";
  import Button from "./Button.svelte";
  import { status, playCard, leaveRoom } from "../socket";

  export let view: ClientView;

  let selectedCard: number | null = null;
  let showLeaveModal = false;

  // ── Opening "who-goes-first" reveal ──
  // While flipping, a bright highlight cycles between the two avatars,
  // decelerating and landing on the real first leader (already known from the
  // first server view — purely cosmetic). The hand stays disabled until it ends.
  let flipping = false;
  let flipHighlight: "me" | "opp" = "opp";
  let timers: ReturnType<typeof setTimeout>[] = [];

  function clearTimers(): void {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function runCoinFlip(): void {
    const target: "me" | "opp" = view.currentRound.iAmLeader ? "me" : "opp";
    flipping = true;
    flipHighlight = "opp";
    // Decelerating tick intervals (~1.5s total); last tick lands on the winner.
    const delays = [70, 80, 95, 115, 140, 170, 205, 245, 290];
    let acc = 0;
    let cur: "me" | "opp" = "opp";
    delays.forEach((d, i) => {
      acc += d;
      const isLast = i === delays.length - 1;
      timers.push(
        setTimeout(() => {
          cur = cur === "opp" ? "me" : "opp";
          flipHighlight = isLast ? target : cur;
        }, acc),
      );
    });
    timers.push(setTimeout(() => (flipping = false), acc + 450));
  }

  onMount(() => {
    const cr0 = view.currentRound;
    const freshStart =
      view.phase === "playing" &&
      cr0.index === 1 &&
      !cr0.leaderHasPlayed &&
      view.myPlayedCards.length === 0;
    if (freshStart) runCoinFlip();
  });

  onDestroy(clearTimers);

  // Glow class per seat: bright static highlight while flipping, gold pulse for
  // the active player once play begins. Deps are passed in so Svelte tracks them.
  function glowFor(
    seat: "me" | "opp",
    isFlipping: boolean,
    flipSeat: "me" | "opp",
    turn: ClientView["turn"],
    phase: ClientView["phase"],
  ): string {
    if (isFlipping) {
      return flipSeat === seat
        ? "scale-110 shadow-[0_0_16px_5px_rgba(217,178,91,0.75)]"
        : "opacity-40";
    }
    if (phase === "playing" && turn === seat) return "animate-turn-pulse";
    return "";
  }

  $: cr = view.currentRound;
  $: myTurn = view.turn === "me" && view.phase === "playing" && !flipping;
  $: canConfirm = selectedCard !== null && myTurn;
  $: oppGlow = glowFor("opp", flipping, flipHighlight, view.turn, view.phase);
  $: meGlow = glowFor("me", flipping, flipHighlight, view.turn, view.phase);

  // Reset selection whenever a new view arrives (round advanced)
  $: {
    view;
    selectedCard = null;
  }

  function onSelect(e: CustomEvent<number>): void {
    if (!myTurn) return;
    selectedCard = e.detail === selectedCard ? null : e.detail;
  }

  function onConfirm(): void {
    if (!canConfirm || selectedCard === null) return;
    playCard(selectedCard);
    selectedCard = null;
  }

  function openLeaveModal(): void {
    showLeaveModal = true;
  }
  function closeLeaveModal(): void {
    showLeaveModal = false;
  }
  function confirmLeave(): void {
    showLeaveModal = false;
    leaveRoom();
  }

  const colorLabel: Record<string, string> = { black: "黑", white: "白" };

  function backCls(color: string, lg = false): string {
    const size = lg
      ? "h-[54px] w-[38px] rounded-[6px]"
      : "h-[38px] w-[26px] rounded-[4px]";
    const tone =
      color === "white"
        ? "bg-back-white-bg border-back-white-border"
        : "bg-back-black-bg border-back-black-border";
    return `shrink-0 border-2 ${size} ${tone}`;
  }

  $: blackBacks = Array(view.opponentRemaining.black).fill("black");
  $: whiteBacks = Array(view.opponentRemaining.white).fill("white");
  $: oppBacks = [...blackBacks, ...whiteBacks];
</script>

<div class="mx-auto w-full max-w-[720px]">
  <div
    class="flex flex-col rounded-[20px] border border-[rgba(217,178,91,0.15)] bg-felt px-[20px] py-[24px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
  >
    <!-- ── Top: Opponent Seat ── -->
    <div
      class="flex flex-col items-center gap-[12px] border-b border-white/[0.08] py-[16px]"
    >
      <div class="flex items-center gap-[12px]">
        <div
          class={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-2 border-gold bg-[rgba(217,178,91,0.18)] text-[1rem] font-bold text-gold transition duration-150 ${oppGlow}`}
        >
          对
        </div>
        <div class="flex flex-col gap-[2px]">
          <span class="text-[0.9rem] font-semibold tracking-[0.5px] text-felt-text">对手</span>
          <span class="text-[0.78rem] text-gold-muted">剩 {view.opponentCardsLeft} 张</span>
        </div>
      </div>

      <!-- Opponent's hand as colored face-down backs -->
      <div class="flex flex-wrap justify-center gap-[6px]">
        {#each oppBacks as color, i (i + "-" + color)}
          <div class={backCls(color)}></div>
        {/each}
      </div>

      <!-- Opponent played-colors history dots -->
      {#if view.opponentPlayedColors.length > 0}
        <div class="flex flex-wrap justify-center gap-[5px]">
          {#each view.opponentPlayedColors as c, i (i)}
            <span
              class={`inline-block h-[10px] w-[10px] shrink-0 rounded-full border ${c === "white" ? "border-[#bbb] bg-[#e8e6df]" : "border-[#555] bg-[#2a2d32]"}`}
              title={colorLabel[c]}
            ></span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Center Strip ── -->
    <div class="flex flex-col items-center gap-[14px] px-[12px] py-[20px]">
      <div
        class="rounded-[100px] border border-[rgba(217,178,91,0.3)] bg-black/25 px-[20px] py-[4px] text-[0.82rem] tracking-[1px] text-gold-muted"
      >
        第 {cr.index} / 9 回合
      </div>

      <div class="flex items-center gap-[8px] text-[1.6rem] font-bold text-felt-text">
        我 <span class="min-w-[2ch] text-center text-gold">{view.scores.me}</span>
        <span class="font-normal text-gold-muted">:</span>
        <span class="min-w-[2ch] text-center text-gold">{view.scores.opp}</span> 对手
      </div>

      <!-- Play zone -->
      <div class="flex min-h-[80px] w-full flex-col items-center justify-center gap-[8px]">
        {#if flipping}
          <p class="text-center text-[0.9rem] font-semibold text-gold">决定先手中…</p>
        {:else if cr.iAmLeader && !cr.leaderHasPlayed && view.turn === "me"}
          <p class="text-center text-[0.9rem] font-semibold text-felt-text">轮到你先出牌</p>
        {:else if !cr.iAmLeader && cr.leaderHasPlayed}
          <div class="flex flex-col items-center gap-[8px]">
            <div class={backCls(cr.leaderColor ?? "black", true)}></div>
            <p class="text-center text-[0.9rem] text-gold-muted">
              对方出牌（{colorLabel[cr.leaderColor ?? "black"]}）
            </p>
            {#if view.turn === "me"}
              <p class="text-center text-[0.9rem] font-semibold text-felt-text">轮到你出牌</p>
            {/if}
          </div>
        {:else if view.turn === "opp"}
          <p class="text-center text-[0.9rem] italic text-gold-muted">等待对手出牌…</p>
        {/if}
      </div>

      <!-- Round results history -->
      {#if view.roundResults.length > 0}
        <div class="flex flex-wrap justify-center gap-[6px]">
          {#each view.roundResults as r, i (i)}
            <Chip result={r} />
          {/each}
        </div>
      {/if}

      {#if $status}
        <p class="text-center text-[0.85rem] text-lose">{$status}</p>
      {/if}
    </div>

    <!-- ── Bottom: My Seat ── -->
    <div
      class="flex flex-col items-center gap-[12px] border-t border-white/[0.08] py-[16px]"
    >
      <div class="flex flex-row-reverse items-center gap-[12px]">
        <div
          class={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-2 border-gold bg-[rgba(217,178,91,0.25)] text-[1rem] font-bold text-gold transition duration-150 ${meGlow}`}
        >
          我
        </div>
        <div class="flex flex-col gap-[2px]">
          <span class="text-[0.9rem] font-semibold tracking-[0.5px] text-felt-text">我</span>
        </div>
      </div>

      <Hand
        cards={view.myHand}
        {myTurn}
        selected={selectedCard}
        on:select={onSelect}
      />

      <div class="flex flex-wrap items-center justify-center gap-[10px]">
        <Button class="min-w-[160px]" disabled={!canConfirm} on:click={onConfirm}>
          确认出牌{selectedCard !== null ? ` · ${selectedCard}` : ""}
        </Button>
        <Button variant="ghost" on:click={openLeaveModal}>退出牌局</Button>
      </div>
    </div>
  </div>
</div>

<!-- ── Leave-game confirmation modal ── -->
{#if showLeaveModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
    on:click|self={closeLeaveModal}
    role="dialog"
    aria-modal="true"
    aria-labelledby="leave-modal-title"
  >
    <div
      class="flex w-[90%] max-w-[360px] flex-col items-center gap-[24px] rounded-[14px] border-2 border-gold bg-felt px-[40px] py-[32px] shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
    >
      <p class="text-center text-[1rem] leading-[1.6] text-felt-text" id="leave-modal-title">
        确定退出？退出将判负，对手获胜。
      </p>
      <div class="flex gap-[12px]">
        <Button variant="danger" on:click={confirmLeave}>确认退出</Button>
        <Button variant="ghost" on:click={closeLeaveModal}>取消</Button>
      </div>
    </div>
  </div>
{/if}
