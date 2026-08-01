<script lang="ts">
  import { onMount } from "svelte";
  import type {
    ClientView,
    HandCategory,
    HandValue,
    PlayerId,
  } from "@texas-poker/shared";
  import {
    act,
    ended,
    leaveRoom,
    nextHand,
    restartMatch,
    roomCode,
    status,
    tryRejoin,
    updateSettings,
    view,
  } from "./socket";
  import Button from "./lib/Button.svelte";
  import ChipStack from "./lib/ChipStack.svelte";
  import Lobby from "./lib/Lobby.svelte";
  import PlayingCard from "./lib/PlayingCard.svelte";

  onMount(tryRejoin);

  type Lang = "zh" | "en";
  type GuideCard =
    | string
    | {
        rank: string;
        suit: "spades" | "hearts" | "diamonds" | "clubs";
      };
  type HandRankGuide = {
    name: Record<Lang, string>;
    label: string;
    sample: GuideCard[];
    note: Record<Lang, string>;
  };

  let amountInput = "5";
  let lastAmountContext = "";
  let startingChipsInput = "300";
  let lastStartingChips = 0;
  let showHandGuide = false;
  let showSettings = false;
  let lang: Lang = "zh";

  const text = {
    zh: {
      langButton: "EN",
      handGuide: "牌型",
      settings: "设置",
      settingsTitle: "牌局设置",
      standardMinRaise: "启用标准最小加注幅度",
      standardMinRaiseNote:
        "关闭时，每次最小加注增量固定为 5。开启后，最小加注增量等于上一次加注幅度。",
      startingChips: "初始筹码",
      startingChipsNote: "保存后，下一次重开牌局会按这个数值开始。",
      save: "保存",
      room: "房间",
      leave: "离开",
      opponent: "对手",
      me: "我",
      chips: "筹码",
      betPlaced: "已下注",
      deck: "牌堆",
      pot: "底池",
      yourTurn: "轮到你行动",
      waiting: "等待对手行动",
      split: "平分底池",
      handWin: "你赢得本手",
      handLose: "对手赢得本手",
      matchWin: "你赢得牌局",
      matchLose: "对手赢得牌局",
      showdownEnd: "摊牌结束",
      foldEnd: "弃牌结束",
      nextHand: "下一手",
      restartMatch: "重开牌局",
      restartMatchNote: "重置双方筹码并开始新牌局",
      settlement: "结算",
      backLobby: "返回大厅",
      close: "关闭",
      strongest: "从强到弱",
      handGuideTitle: "牌型大小",
      actions: {
        fold: "弃牌",
        check: "过牌",
        call: "跟注",
        bet: "下注",
        raise: "加注",
        allIn: "全下",
        callAllIn: "跟注全下",
      },
      street: {
        preflop: "翻牌前",
        flop: "翻牌",
        turn: "转牌",
        river: "河牌",
        showdown: "摊牌",
      },
    },
    en: {
      langButton: "中文",
      handGuide: "Hands",
      settings: "Settings",
      settingsTitle: "Game Settings",
      standardMinRaise: "Use standard minimum raise",
      standardMinRaiseNote:
        "Off: every minimum raise increment is fixed at 5. On: the minimum raise increment follows the previous raise size.",
      startingChips: "Starting chips",
      startingChipsNote: "Saved value applies the next time the match restarts.",
      save: "Save",
      room: "Room",
      leave: "Leave",
      opponent: "Opponent",
      me: "Me",
      chips: "chips",
      betPlaced: "Bet",
      deck: "Deck",
      pot: "Pot",
      yourTurn: "Your turn",
      waiting: "Waiting",
      split: "Split pot",
      handWin: "You win the hand",
      handLose: "Opponent wins the hand",
      matchWin: "You win the match",
      matchLose: "Opponent wins the match",
      showdownEnd: "Showdown complete",
      foldEnd: "Fold complete",
      nextHand: "Next hand",
      restartMatch: "Restart match",
      restartMatchNote: "Reset both stacks and start a new match",
      settlement: "Settlement",
      backLobby: "Back to lobby",
      close: "Close",
      strongest: "Strongest to weakest",
      handGuideTitle: "Hand Rankings",
      actions: {
        fold: "Fold",
        check: "Check",
        call: "Call",
        bet: "Bet",
        raise: "Raise",
        allIn: "All-in",
        callAllIn: "Call all-in",
      },
      street: {
        preflop: "Preflop",
        flop: "Flop",
        turn: "Turn",
        river: "River",
        showdown: "Showdown",
      },
    },
  } as const;

  const handRanks: HandRankGuide[] = [
    {
      name: { zh: "皇家同花顺", en: "Royal Flush" },
      label: "Royal Flush",
      sample: [
        { rank: "A", suit: "hearts" },
        { rank: "K", suit: "hearts" },
        { rank: "Q", suit: "hearts" },
        { rank: "J", suit: "hearts" },
        { rank: "10", suit: "hearts" },
      ],
      note: { zh: "同花色最大顺子", en: "Ace-high straight flush" },
    },
    {
      name: { zh: "同花顺", en: "Straight Flush" },
      label: "Straight Flush",
      sample: [
        { rank: "9", suit: "spades" },
        { rank: "8", suit: "spades" },
        { rank: "7", suit: "spades" },
        { rank: "6", suit: "spades" },
        { rank: "5", suit: "spades" },
      ],
      note: { zh: "同花色连续五张", en: "Five suited cards in order" },
    },
    {
      name: { zh: "四条", en: "Four of a Kind" },
      label: "Four of a Kind",
      sample: ["Q", "Q", "Q", "Q", "4"],
      note: { zh: "四张同点数", en: "Four cards of one rank" },
    },
    {
      name: { zh: "葫芦", en: "Full House" },
      label: "Full House",
      sample: ["J", "J", "J", "7", "7"],
      note: { zh: "三条加一对", en: "Trips plus a pair" },
    },
    {
      name: { zh: "同花", en: "Flush" },
      label: "Flush",
      sample: [
        { rank: "A", suit: "diamonds" },
        { rank: "J", suit: "diamonds" },
        { rank: "8", suit: "diamonds" },
        { rank: "5", suit: "diamonds" },
        { rank: "2", suit: "diamonds" },
      ],
      note: { zh: "五张同花色", en: "Five cards of one suit" },
    },
    {
      name: { zh: "顺子", en: "Straight" },
      label: "Straight",
      sample: ["10", "9", "8", "7", "6"],
      note: { zh: "连续五张", en: "Five cards in order" },
    },
    {
      name: { zh: "三条", en: "Three of a Kind" },
      label: "Three of a Kind",
      sample: ["8", "8", "8", "K", "3"],
      note: { zh: "三张同点数", en: "Three cards of one rank" },
    },
    {
      name: { zh: "两对", en: "Two Pair" },
      label: "Two Pair",
      sample: ["A", "A", "5", "5", "9"],
      note: { zh: "两组对子", en: "Two separate pairs" },
    },
    {
      name: { zh: "一对", en: "One Pair" },
      label: "One Pair",
      sample: ["K", "K", "Q", "8", "2"],
      note: { zh: "一组对子", en: "One pair" },
    },
    {
      name: { zh: "高牌", en: "High Card" },
      label: "High Card",
      sample: ["A", "Q", "9", "6", "3"],
      note: { zh: "没有成牌时比最大牌", en: "Highest cards decide" },
    },
  ];

  const handCategoryText: Record<
    HandCategory,
    { zh: string; en: string }
  > = {
    "high-card": { zh: "高牌", en: "High Card" },
    pair: { zh: "一对", en: "One Pair" },
    "two-pair": { zh: "两对", en: "Two Pair" },
    "three-kind": { zh: "三条", en: "Three of a Kind" },
    straight: { zh: "顺子", en: "Straight" },
    flush: { zh: "同花", en: "Flush" },
    "full-house": { zh: "葫芦", en: "Full House" },
    "four-kind": { zh: "四条", en: "Four of a Kind" },
    "straight-flush": { zh: "同花顺", en: "Straight Flush" },
  };

  $: copy = text[lang];
  $: legal = $view?.legalActions;
  $: myTurn = $view?.phase === "betting" && $view.actionOn === "me";
  $: minAmount = legal?.minBet ?? legal?.minRaiseTo ?? 0;
  $: maxAmount = legal?.maxBet ?? legal?.maxRaiseTo ?? 0;
  $: amountContext =
    myTurn && (legal?.canBet || legal?.minRaiseTo)
      ? [
          $view?.street,
          $view?.pot,
          $view?.players.me.streetBet,
          minAmount,
          maxAmount,
          legal?.canBet ? "bet" : "raise",
        ].join(":")
      : "";
  $: if (amountContext && amountContext !== lastAmountContext) {
    amountInput = String(minAmount);
    lastAmountContext = amountContext;
  }
  $: if (
    $view?.settings.startingChips &&
    $view.settings.startingChips !== lastStartingChips
  ) {
    startingChipsInput = String($view.settings.startingChips);
    lastStartingChips = $view.settings.startingChips;
  }
  $: payableCall = $view
    ? Math.min(legal?.callAmount ?? 0, $view.players.me.chips)
    : 0;
  $: callIsAllIn =
    !!legal?.canCall && !!$view && legal.callAmount >= $view.players.me.chips;

  const guideSuitSymbol: Record<
    Exclude<GuideCard, string>["suit"],
    string
  > = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  };

  function handleAmountInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const digits = input.value.replace(/\D/g, "");
    if (digits === "") {
      amountInput = "";
      return;
    }
    const value = Number(digits);
    amountInput = String(maxAmount > 0 && value > maxAmount ? maxAmount : value);
  }

  function commitAmountBounds(): void {
    const value = Number(amountInput);
    if (!Number.isFinite(value)) {
      amountInput = String(minAmount);
      return;
    }
    const cappedMax = maxAmount > 0 ? Math.min(value, maxAmount) : value;
    amountInput = String(minAmount > 0 ? Math.max(cappedMax, minAmount) : cappedMax);
  }

  function actionAmount(): number {
    commitAmountBounds();
    return Number(amountInput);
  }

  function handleStartingChipsInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const digits = input.value.replace(/\D/g, "");
    if (digits === "") {
      startingChipsInput = "";
      return;
    }
    const value = Number(digits);
    startingChipsInput = String(value > 100000 ? 100000 : value);
  }

  function boundedStartingChips(): number {
    const value = Number(startingChipsInput);
    return Number.isFinite(value)
      ? Math.min(100000, Math.max(20, Math.round(value)))
      : 300;
  }

  function commitStartingChipsBounds(): void {
    startingChipsInput = String(boundedStartingChips());
  }

  function saveStartingChips(): void {
    const bounded = boundedStartingChips();
    startingChipsInput = String(bounded);
    updateSettings({ startingChips: bounded });
  }

  function guideCardRank(card: GuideCard): string {
    return typeof card === "string" ? card : card.rank;
  }

  function guideCardSuit(card: GuideCard): string {
    return typeof card === "string" ? "" : guideSuitSymbol[card.suit];
  }

  function guideCardRed(card: GuideCard): boolean {
    return (
      typeof card !== "string" &&
      (card.suit === "hearts" || card.suit === "diamonds")
    );
  }

  function blindBadge(
    activeView: ClientView,
    seat: "me" | "opp",
    activeLang: Lang,
  ): string {
    if (activeView.dealer === seat) {
      return activeLang === "zh" ? "庄 / 小盲" : "D / SB";
    }
    return activeLang === "zh" ? "大盲" : "BB";
  }

  function playerIdFor(activeView: ClientView, seat: "me" | "opp"): PlayerId {
    if (seat === "me") return activeView.myId;
    return activeView.myId === "p1" ? "p2" : "p1";
  }

  function handFor(
    activeView: ClientView,
    seat: "me" | "opp",
  ): HandValue | null {
    if (!activeView.showdown) return null;
    return activeView.showdown.hands[playerIdFor(activeView, seat)] ?? null;
  }

  function handLabel(hand: HandValue | null): string {
    if (!hand) return "";
    if (hand.category === "straight-flush" && hand.ranks[0] === 14) {
      return lang === "zh" ? "皇家同花顺" : "Royal Flush";
    }
    return handCategoryText[hand.category][lang];
  }

  function isWinnerSeat(activeView: ClientView, seat: "me" | "opp"): boolean {
    return (
      activeView.showdown?.winners.includes(playerIdFor(activeView, seat)) ??
      false
    );
  }

  function highlightedForSeat(
    activeView: ClientView,
    seat: "me" | "opp",
    cardId: string,
  ): boolean {
    if (!isWinnerSeat(activeView, seat)) return false;
    return handFor(activeView, seat)?.cardIds.includes(cardId) ?? false;
  }

  function highlightedCommunity(activeView: ClientView, cardId: string): boolean {
    if (!activeView.showdown) return false;
    return activeView.showdown.winners.some((winner) =>
      activeView.showdown?.hands[winner].cardIds.includes(cardId),
    );
  }

  function winnerHand(activeView: ClientView): HandValue | null {
    if (!activeView.showdown || activeView.showdown.winners.length === 0) {
      return null;
    }
    return activeView.showdown.hands[activeView.showdown.winners[0]] ?? null;
  }

  function resultText(activeView: ClientView): string {
    const label = handLabel(winnerHand(activeView));
    if (activeView.winner === "split") {
      return label ? `${copy.split} ${label}` : copy.split;
    }
    if (activeView.winner === "me" || activeView.winner === "opp") {
      const winnerName =
        activeView.winner === "me" ? copy.me : copy.opponent;
      if (lang === "zh") return `${winnerName}胜${label ? ` ${label}` : ""}`;
      return `${winnerName} wins${label ? ` with ${label}` : ""}`;
    }
    return "";
  }
</script>

<main
  class="min-h-screen w-full overflow-hidden bg-bg px-3 py-3 text-felt-text"
>
  <div
    class="mx-auto flex h-[calc(100vh-24px)] w-full max-w-[1320px] items-center justify-center"
  >
    {#if $ended}
      <div class="fixed right-4 top-4 z-30">
        <Button
          variant="secondary"
          on:click={() => (lang = lang === "zh" ? "en" : "zh")}
        >
          {copy.langButton}
        </Button>
      </div>
      <section
        class="flex w-full max-w-[460px] flex-col items-center gap-5 rounded-[16px] border-2 border-gold bg-felt p-7 text-center"
      >
        <p class="text-xl font-bold text-felt-text">{$ended}</p>
        <Button on:click={leaveRoom}>{copy.backLobby}</Button>
      </section>
    {:else if $view}
      <section class="relative flex h-full w-full flex-col gap-3">
        <header
          class="flex shrink-0 flex-wrap items-center justify-between gap-2"
        >
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="secondary" on:click={() => (showHandGuide = true)}>
              {copy.handGuide}
            </Button>
            <Button variant="secondary" on:click={() => (showSettings = true)}>
              {copy.settings}
            </Button>
            <span
              class="rounded-[100px] border border-[rgba(217,178,91,0.32)] bg-black/25 px-4 py-1.5 text-[0.78rem] tracking-[1px] text-gold-muted"
            >
              {copy.room}
              {$roomCode}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="secondary"
              on:click={() => (lang = lang === "zh" ? "en" : "zh")}
            >
              {copy.langButton}
            </Button>
            <Button variant="secondary" on:click={leaveRoom}
              >{copy.leave}</Button
            >
          </div>
        </header>

        <div
          class="absolute right-0 top-[74px] z-20 flex items-center gap-4 rounded-[14px] border border-[rgba(217,178,91,0.3)] bg-black/35 px-5 py-4 shadow-[0_10px_26px_rgba(0,0,0,0.24)]"
        >
          <div
            class={`flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 border-gold bg-[rgba(217,178,91,0.18)] text-2xl font-black text-gold ${$view.actionOn === "opp" ? "animate-turn-pulse" : ""}`}
          >
            {lang === "zh" ? "对" : "O"}
          </div>
          <div class="min-w-[144px]">
            <div class="flex items-center gap-2">
              <p class="text-[1.28rem] font-black leading-tight text-felt-text">
                {copy.opponent}
              </p>
              <span
                class="rounded-[999px] border border-gold/45 px-2 py-0.5 text-[0.78rem] font-black text-gold"
              >
                {blindBadge($view, "opp", lang)}
              </span>
            </div>
            <p class="text-[1.02rem] font-bold leading-tight text-gold-muted">
              {$view.players.opp.chips}
              {copy.chips}
            </p>
          </div>
          <ChipStack amount={$view.players.opp.chips} compact />
        </div>

        <div
          class="absolute bottom-3 left-0 z-20 flex items-center gap-4 rounded-[14px] border border-[rgba(217,178,91,0.3)] bg-black/35 px-5 py-4 shadow-[0_10px_26px_rgba(0,0,0,0.24)]"
        >
          <div
            class={`flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 border-gold bg-[rgba(217,178,91,0.25)] text-2xl font-black text-gold ${$view.actionOn === "me" ? "animate-turn-pulse" : ""}`}
          >
            {lang === "zh" ? "我" : "M"}
          </div>
          <div class="min-w-[144px]">
            <div class="flex items-center gap-2">
              <p class="text-[1.28rem] font-black leading-tight text-felt-text">
                {copy.me}
              </p>
              <span
                class="rounded-[999px] border border-gold/45 px-2 py-0.5 text-[0.78rem] font-black text-gold"
              >
                {blindBadge($view, "me", lang)}
              </span>
            </div>
            <p class="text-[1.02rem] font-bold leading-tight text-gold-muted">
              {$view.players.me.chips}
              {copy.chips}
            </p>
          </div>
          <ChipStack amount={$view.players.me.chips} compact />
        </div>

        <div
          class="oval-poker-table poker-table-size relative mx-auto overflow-hidden rounded-[999px] border-[10px] border-[rgba(217,178,91,0.42)] bg-felt shadow-[inset_0_0_0_2px_rgba(255,255,255,0.05),inset_0_18px_48px_rgba(0,0,0,0.28),0_18px_60px_rgba(0,0,0,0.48)]"
        >
          <div
            class="absolute left-1/2 top-[3.5%] flex -translate-x-1/2 flex-col items-center gap-2"
          >
            {#if $view.players.opp.streetBet > 0}
              <div
                class="flex items-center gap-2 rounded-[999px] bg-black/20 px-3 py-1"
              >
                <ChipStack amount={$view.players.opp.streetBet} compact />
                <span class="text-[0.95rem] font-bold text-gold-muted">
                  {copy.betPlaced}
                  {$view.players.opp.streetBet}
                </span>
              </div>
            {/if}
            <div class="flex gap-[7px]">
              {#if $view.opponentHoleCards}
                {#each $view.opponentHoleCards as card (card.id)}
                  <div class="deal-animation animate-deal-card">
                    <PlayingCard
                      {card}
                      highlighted={highlightedForSeat($view, "opp", card.id)}
                    />
                  </div>
                {/each}
              {:else}
                {#each Array($view.opponentHoleCount) as _, i (i)}
                  <div class="deal-animation animate-deal-card">
                    <PlayingCard faceDown />
                  </div>
                {/each}
              {/if}
            </div>
            {#if handFor($view, "opp")}
              <span
                class="rounded-[999px] bg-black/22 px-3 py-1 text-[1rem] font-black text-gold"
              >
                {handLabel(handFor($view, "opp"))}
              </span>
            {/if}
          </div>

          <div
            class="deck-stack absolute left-[8%] top-1/2 hidden -translate-y-1/2 sm:block"
            aria-label="牌堆"
          >
            <div class="relative h-[116px] w-[84px]">
              <div
                class="absolute left-2 top-2 h-[112px] w-[80px] rounded-[8px] border-2 border-gold bg-back-bg shadow-[0_6px_14px_rgba(0,0,0,0.28)]"
              ></div>
              <div
                class="absolute left-1 top-1 h-[112px] w-[80px] rounded-[8px] border-2 border-gold bg-back-bg shadow-[0_6px_14px_rgba(0,0,0,0.28)]"
              ></div>
              <div
                class="absolute left-0 top-0 flex h-[112px] w-[80px] items-center justify-center rounded-[8px] border-2 border-gold bg-back-bg text-[0.92rem] font-black tracking-[2px] text-gold shadow-[0_6px_14px_rgba(0,0,0,0.28)]"
              >
                {copy.deck}
              </div>
            </div>
          </div>

          <div
            class="absolute right-[11%] top-1/2 flex w-[156px] -translate-y-1/2 flex-col items-center gap-2 rounded-[18px] border border-[rgba(217,178,91,0.32)] bg-black/24 px-5 py-4 text-center shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
          >
            <p class="text-[1.15rem] font-black tracking-[1px] text-gold-muted">
              {copy.pot}
            </p>
            <p class="text-[3.25rem] font-black leading-none text-felt-text">
              {$view.pot}
            </p>
            <ChipStack amount={$view.pot} />
          </div>

          <div
            class="absolute left-1/2 top-[48%] flex w-full max-w-[660px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 px-5"
          >
            <div class="flex flex-wrap justify-center gap-[7px]">
              {#each $view.communityCards as card (card.id)}
                <div class="deal-animation animate-deal-card">
                  <PlayingCard
                    {card}
                    highlighted={highlightedCommunity($view, card.id)}
                  />
                </div>
              {/each}
              {#each Array(5 - $view.communityCards.length) as _, i (i)}
                <div
                  class="flex h-[88px] w-[62px] items-center justify-center rounded-[8px] border-2 border-dashed border-gold-muted/35 bg-black/15 text-[0.9rem] text-gold-muted sm:h-[112px] sm:w-[80px]"
                >
                  {i + $view.communityCards.length + 1}
                </div>
              {/each}
            </div>

            {#if $view.phase === "finished"}
              <div
                class="rounded-[999px] bg-black/20 px-5 py-2 text-center shadow-[0_8px_18px_rgba(0,0,0,0.16)]"
              >
                <p class="min-w-[7rem] text-[1rem] font-bold text-gold">
                  {resultText($view)}
                </p>
              </div>
            {/if}
          </div>

          <div
            class="absolute bottom-[2.5%] left-1/2 flex w-[min(94%,880px)] -translate-x-1/2 flex-col items-center gap-3"
          >
            {#if $view.phase === "finished"}
              <div
                class="player-action-row flex max-w-full flex-wrap items-center justify-center gap-2"
              >
                <span class="px-2 text-sm font-semibold text-gold">
                  {$view.winReason === "showdown"
                    ? copy.showdownEnd
                    : copy.foldEnd}
                </span>
                {#if $view.canStartNextHand}
                  <Button on:click={nextHand}>{copy.nextHand}</Button>
                {/if}
              </div>
            {:else if myTurn}
              <div
                class="player-action-row flex max-w-full flex-wrap items-center justify-center gap-2"
              >
                <Button
                  variant="danger"
                  disabled={!legal?.canFold}
                  on:click={() => act({ type: "fold" })}
                >
                  {copy.actions.fold}
                </Button>

                {#if legal?.canCheck}
                  <Button
                    variant="secondary"
                    on:click={() => act({ type: "check" })}
                  >
                    {copy.actions.check}
                  </Button>
                {:else if legal?.canCall}
                  <Button on:click={() => act({ type: "call" })}>
                    {callIsAllIn ? copy.actions.callAllIn : copy.actions.call}
                    {payableCall}
                  </Button>
                {:else}
                  <Button variant="secondary" disabled
                    >{copy.actions.check}</Button
                  >
                {/if}

                {#if legal?.canBet || legal?.minRaiseTo}
                  <div
                    class="flex min-h-[46px] items-center overflow-hidden rounded-[8px] border border-[rgba(217,178,91,0.45)] bg-black/25"
                  >
                    <input
                      class="no-spinner h-[44px] w-[58px] bg-transparent px-1 text-center text-[22px] font-black text-felt-text outline-none"
                      type="text"
                      inputmode="numeric"
                      min={minAmount}
                      max={maxAmount}
                      step="5"
                      value={amountInput}
                      on:input={handleAmountInput}
                      on:blur={commitAmountBounds}
                      aria-label="下注金额"
                    />
                    <Button
                      disabled={maxAmount <= 0}
                      on:click={() =>
                        act(
                          legal?.canBet
                            ? { type: "bet", amount: actionAmount() }
                            : { type: "raise", amount: actionAmount() },
                        )}
                    >
                      {legal?.canBet ? copy.actions.bet : copy.actions.raise}
                    </Button>
                  </div>
                {/if}

                {#if !callIsAllIn}
                  <Button
                    variant="secondary"
                    disabled={!legal?.canAllIn}
                    on:click={() => act({ type: "all-in" })}
                  >
                    {copy.actions.allIn}
                  </Button>
                {/if}

                {#if $view.players.me.streetBet > 0}
                  <div
                    class="ml-1 flex items-center gap-2 rounded-[999px] bg-black/20 px-3 py-1"
                  >
                    <span class="text-[0.95rem] font-bold text-gold-muted">
                      {copy.betPlaced}
                      {$view.players.me.streetBet}
                    </span>
                    <ChipStack amount={$view.players.me.streetBet} compact />
                  </div>
                {/if}
              </div>
            {/if}

            {#if $view.players.me.streetBet > 0 && !myTurn}
              <div
                class="flex items-center gap-2 rounded-[999px] bg-black/20 px-3 py-1"
              >
                <span class="text-[0.95rem] font-bold text-gold-muted">
                  {copy.betPlaced}
                  {$view.players.me.streetBet}
                </span>
                <ChipStack amount={$view.players.me.streetBet} compact />
              </div>
            {/if}

            <div class="flex justify-center gap-[8px]">
              {#each $view.myHoleCards as card (card.id)}
                <div class="deal-animation animate-deal-card">
                  <PlayingCard
                    {card}
                    highlighted={highlightedForSeat($view, "me", card.id)}
                  />
                </div>
              {/each}
            </div>
            {#if handFor($view, "me")}
              <span
                class="rounded-[999px] bg-black/22 px-3 py-1 text-[1rem] font-black text-gold"
              >
                {handLabel(handFor($view, "me"))}
              </span>
            {/if}
          </div>

        </div>
        {#if $view.matchOver}
          <section
            class="absolute right-0 top-[172px] z-30 w-[min(92vw,330px)] rounded-[14px] border-2 border-gold bg-felt-dark/95 p-5 text-center shadow-[0_18px_50px_rgba(0,0,0,0.48)] backdrop-blur-sm"
          >
            <p
              class="text-[0.82rem] font-bold uppercase tracking-[2px] text-gold-muted"
            >
              {copy.settlement}
            </p>
            <h2 class="mt-2 text-[1.45rem] font-black text-felt-text">
              {$view.matchWinner === "me" ? copy.matchWin : copy.matchLose}
            </h2>
            <p class="mt-2 text-[1rem] font-semibold text-gold-muted">
              {$view.players.me.chips} : {$view.players.opp.chips}
            </p>
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              <Button on:click={restartMatch}>{copy.restartMatch}</Button>
              <Button variant="secondary" on:click={leaveRoom}
                >{copy.backLobby}</Button
              >
            </div>
          </section>
        {/if}
        {#if showHandGuide}
          <div
            class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-5"
          >
            <button
              class="absolute inset-0 cursor-pointer"
              type="button"
              aria-label={copy.close}
              on:click={() => (showHandGuide = false)}
            ></button>
            <div
              class="relative z-10 max-h-[min(90vh,820px)] w-full max-w-[920px] overflow-hidden rounded-[16px] border-2 border-gold bg-felt-dark shadow-[0_24px_80px_rgba(0,0,0,0.62)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="hand-guide-title"
            >
              <div
                class="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-5"
              >
                <div>
                  <p
                    class="text-[0.95rem] font-black uppercase tracking-[2px] text-gold-muted"
                  >
                    {copy.strongest}
                  </p>
                  <h2
                    id="hand-guide-title"
                    class="text-4xl font-black text-felt-text"
                  >
                    {copy.handGuideTitle}
                  </h2>
                </div>
                <Button
                  variant="secondary"
                  on:click={() => (showHandGuide = false)}
                >
                  {copy.close}
                </Button>
              </div>

              <div
                class="grid max-h-[calc(min(90vh,820px)-112px)] grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2"
              >
                {#each handRanks as hand, index}
                  <article
                    class="flex min-h-[106px] items-center gap-4 rounded-[10px] border border-[rgba(217,178,91,0.22)] bg-black/20 p-4"
                  >
                    <div
                      class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-gold/12 text-lg font-black text-gold"
                    >
                      {index + 1}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div
                        class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                      >
                        <h3 class="text-[1.34rem] font-black text-felt-text">
                          {hand.name[lang]}
                        </h3>
                        {#if lang === "zh"}
                          <span
                            class="text-[0.95rem] font-semibold text-gold-muted"
                          >
                            {hand.label}
                          </span>
                        {/if}
                      </div>
                      <p class="text-[0.98rem] font-semibold text-gold-muted">
                        {hand.note[lang]}
                      </p>
                    </div>
                    <div class="flex shrink-0 -space-x-1.5">
                      {#each hand.sample as card}
                        <span
                          class={`flex h-11 w-8 flex-col items-center justify-center rounded-[6px] border border-card-border bg-card text-[0.95rem] font-black leading-none shadow-[0_3px_8px_rgba(0,0,0,0.2)] ${guideCardRed(card) ? "text-card-red" : "text-card-black"}`}
                        >
                          <span>{guideCardRank(card)}</span>
                          {#if guideCardSuit(card)}
                            <span class="text-[0.8rem] leading-none">
                              {guideCardSuit(card)}
                            </span>
                          {/if}
                        </span>
                      {/each}
                    </div>
                  </article>
                {/each}
              </div>
            </div>
          </div>
        {/if}
        {#if showSettings}
          <div
            class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-5"
          >
            <button
              class="absolute inset-0 cursor-pointer"
              type="button"
              aria-label={copy.close}
              on:click={() => (showSettings = false)}
            ></button>
            <div
              class="relative z-10 w-full max-w-[520px] rounded-[16px] border-2 border-gold bg-felt-dark p-6 shadow-[0_24px_80px_rgba(0,0,0,0.62)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
            >
              <div class="flex items-center justify-between gap-3">
                <h2
                  id="settings-title"
                  class="text-3xl font-black text-felt-text"
                >
                  {copy.settingsTitle}
                </h2>
                <Button
                  variant="secondary"
                  on:click={() => (showSettings = false)}
                >
                  {copy.close}
                </Button>
              </div>
              <label
                class="mt-6 flex cursor-pointer items-center justify-between gap-5 rounded-[12px] border border-[rgba(217,178,91,0.28)] bg-black/20 p-4"
              >
                <span>
                  <span class="block text-[1.18rem] font-black text-felt-text">
                    {copy.standardMinRaise}
                  </span>
                  <span
                    class="mt-1 block text-[0.98rem] font-semibold leading-snug text-gold-muted"
                  >
                    {copy.standardMinRaiseNote}
                  </span>
                </span>
                <input
                  class="h-7 w-7 shrink-0 cursor-pointer accent-[#d9b25b]"
                  type="checkbox"
                  checked={$view.settings.enforceMinRaise}
                  on:change={(event) =>
                    updateSettings({
                      enforceMinRaise: (
                        event.currentTarget as HTMLInputElement
                      ).checked,
                    })}
                />
              </label>
              <div
                class="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-[rgba(217,178,91,0.28)] bg-black/20 p-4"
              >
                <span class="min-w-[210px] flex-1">
                  <span class="block text-[1.18rem] font-black text-felt-text">
                    {copy.startingChips}
                  </span>
                  <span
                    class="mt-1 block text-[0.98rem] font-semibold leading-snug text-gold-muted"
                  >
                    {copy.startingChipsNote}
                  </span>
                </span>
                <div class="flex shrink-0 items-center gap-2">
                  <input
                    class="no-spinner h-[46px] w-[92px] rounded-[8px] border border-[rgba(217,178,91,0.45)] bg-black/25 px-2 text-center text-[1.45rem] font-black text-felt-text outline-none focus:border-gold"
                    type="text"
                    inputmode="numeric"
                    min="20"
                    max="100000"
                    step="5"
                    value={startingChipsInput}
                    on:input={handleStartingChipsInput}
                    on:blur={commitStartingChipsBounds}
                    aria-label={copy.startingChips}
                  />
                  <Button on:click={saveStartingChips}>{copy.save}</Button>
                </div>
              </div>
              <div
                class="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-5"
              >
                <span class="text-left">
                  <span class="block text-[1.08rem] font-black text-felt-text">
                    {copy.restartMatch}
                  </span>
                  <span
                    class="mt-1 block text-[0.95rem] font-semibold leading-snug text-gold-muted"
                  >
                    {copy.restartMatchNote}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  on:click={() => {
                    restartMatch();
                    showSettings = false;
                  }}
                >
                  {copy.restartMatch}
                </Button>
              </div>
            </div>
          </div>
        {/if}
        {#if $status}
          <p class="shrink-0 text-center text-[0.85rem] text-danger">
            {$status}
          </p>
        {/if}
      </section>
    {:else}
      <div class="fixed right-4 top-4 z-30">
        <Button
          variant="secondary"
          on:click={() => (lang = lang === "zh" ? "en" : "zh")}
        >
          {copy.langButton}
        </Button>
      </div>
      <Lobby {lang} />
    {/if}
  </div>
</main>
