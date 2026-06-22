<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { colorOf } from "@bw/shared";

  export let cards: number[];
  export let myTurn: boolean;
  export let selected: number | null = null;

  const dispatch = createEventDispatcher<{ select: number }>();

  function handleClick(c: number): void {
    if (!myTurn) return;
    dispatch("select", c);
  }

  const base =
    "relative flex h-[54px] w-[38px] cursor-pointer items-center justify-center " +
    "rounded-[6px] border-2 text-[1rem] font-medium transition duration-150 " +
    "disabled:cursor-not-allowed disabled:opacity-55";

  // `sel` is passed in (not read from closure) so Svelte tracks `selected` as a
  // dependency of the class expression and re-renders the highlight on change.
  function cls(c: number, sel: number | null): string {
    const isBlack = colorOf(c) === "black";
    const isSel = sel === c;
    const bgText = isBlack
      ? "bg-card-black-bg text-card-black-text"
      : "bg-card-white-bg text-card-white-text";
    const border = isSel
      ? "border-gold"
      : isBlack
        ? "border-card-black-border"
        : "border-card-white-border";
    const lift = isSel
      ? "-translate-y-[8px] shadow-[0_0_0_2px_var(--color-gold),0_6px_16px_rgba(0,0,0,0.5)]"
      : "enabled:hover:-translate-y-[4px] enabled:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]";
    return `${base} ${bgText} ${border} ${lift}`;
  }
</script>

<div class="flex flex-wrap justify-center gap-[10px] pb-[16px] pt-[8px]">
  {#each cards as c (c)}
    <button
      class={cls(c, selected)}
      disabled={!myTurn}
      on:click={() => handleClick(c)}
      aria-pressed={selected === c}
    >
      <span class="pointer-events-none select-none">{c}</span>
    </button>
  {/each}
</div>
