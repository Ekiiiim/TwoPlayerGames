<script lang="ts">
  import type { Card } from "@add-to-fifty/shared";

  export let card: Card;
  export let disabled = false;
  export let selected = false;

  const suitSymbol: Record<Card["suit"], string> = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  };

  $: red = card.suit === "hearts" || card.suit === "diamonds";
</script>

<button
  class="relative flex h-[92px] w-[66px] shrink-0 cursor-pointer flex-col justify-between rounded-[7px] border-2 border-card-border bg-card p-[7px] text-left shadow-[0_6px_16px_rgba(0,0,0,0.35)] transition duration-150 enabled:hover:-translate-y-[5px] enabled:hover:border-gold disabled:cursor-not-allowed disabled:opacity-55 sm:h-[118px] sm:w-[84px] sm:rounded-[8px] sm:p-[9px]"
  class:text-card-red={red}
  class:text-card-black={!red}
  class:border-gold={selected}
  class:-translate-y-[8px]={selected}
  class:shadow-[0_0_0_2px_var(--color-gold),0_8px_20px_rgba(0,0,0,0.45)]={selected}
  {disabled}
  on:click
  aria-pressed={selected}
>
  <span class="flex flex-col items-start text-[1rem] font-black leading-none sm:text-[1.2rem]">
    {card.rank}
    <span class="text-[0.95rem] leading-none sm:text-[1.1rem]">
      {suitSymbol[card.suit]}
    </span>
  </span>

  <span class="self-center text-[2rem] font-black leading-none sm:text-[2.8rem]">
    {suitSymbol[card.suit]}
  </span>

  <span
    class="flex rotate-180 flex-col items-start self-end text-[1rem] font-black leading-none sm:text-[1.2rem]"
  >
    {card.rank}
    <span class="text-[0.95rem] leading-none sm:text-[1.1rem]">
      {suitSymbol[card.suit]}
    </span>
  </span>
</button>
