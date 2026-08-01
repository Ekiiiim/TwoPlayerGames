<script lang="ts">
  import type { Card } from "@texas-poker/shared";

  export let card: Card | null = null;
  export let faceDown = false;
  export let highlighted = false;

  const suitSymbol: Record<Card["suit"], string> = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  };

  $: red = card?.suit === "hearts" || card?.suit === "diamonds";
</script>

{#if faceDown || !card}
  <div
    class="flex h-[88px] w-[62px] shrink-0 items-center justify-center rounded-[8px] border-2 border-back-border bg-back-bg shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:h-[112px] sm:w-[80px]"
  >
    <div class="h-[68%] w-[62%] rounded-[5px] border border-gold/35"></div>
  </div>
{:else}
  <div
    class={`flex h-[88px] w-[62px] shrink-0 flex-col justify-between rounded-[8px] border-2 border-card-border bg-card p-[7px] text-left shadow-[0_6px_16px_rgba(0,0,0,0.35)] sm:h-[112px] sm:w-[80px] sm:p-[8px] ${highlighted ? "!border-gold shadow-[0_0_0_3px_rgba(217,178,91,0.75),0_10px_24px_rgba(0,0,0,0.45)]" : ""}`}
    class:text-card-red={red}
    class:text-card-black={!red}
  >
    <span
      class="flex flex-col items-start text-[0.95rem] font-black leading-none sm:text-[1.12rem]"
    >
      {card.rank}
      <span class="text-[0.9rem] leading-none sm:text-[1.05rem]">
        {suitSymbol[card.suit]}
      </span>
    </span>
    <span
      class="self-center text-[2rem] font-black leading-none sm:text-[2.62rem]"
    >
      {suitSymbol[card.suit]}
    </span>
    <span
      class="flex rotate-180 flex-col items-start self-end text-[0.95rem] font-black leading-none sm:text-[1.12rem]"
    >
      {card.rank}
      <span class="text-[0.9rem] leading-none sm:text-[1.05rem]">
        {suitSymbol[card.suit]}
      </span>
    </span>
  </div>
{/if}
