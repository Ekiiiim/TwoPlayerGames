<script lang="ts">
  import { colorOf, type GameReview } from "@bw/shared";
  import { rematch, leaveRoom, status } from "../socket";
  import Chip from "./Chip.svelte";
  import Button from "./Button.svelte";

  export let review: GameReview;

  const th =
    "border-b border-white/10 px-[12px] py-[8px] text-center font-semibold tracking-[0.5px] text-gold-muted";
  const td =
    "border-b border-white/[0.05] px-[12px] py-[8px] text-center text-felt-text";

  function badge(card: number): string {
    const black = colorOf(card) === "black";
    return (
      "inline-block h-[38px] w-[28px] rounded-[4px] border text-center text-[0.85rem] font-semibold leading-[38px] " +
      (black
        ? "bg-card-black-bg text-card-black-text border-card-black-border"
        : "bg-card-white-bg text-card-white-text border-card-white-border")
    );
  }

  function rowBg(result: string): string {
    if (result === "win") return "bg-[rgba(46,160,67,0.1)]";
    if (result === "lose") return "bg-[rgba(192,57,43,0.1)]";
    return "";
  }
</script>

<div
  class="flex w-full max-w-[600px] flex-col items-center gap-[24px] rounded-[20px] border border-[rgba(217,178,91,0.2)] bg-felt px-[40px] py-[36px] shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
>
  <div class="flex flex-col items-center gap-[6px]">
    {#if review.winner === "me"}
      <span class="text-[1.8rem] font-extrabold tracking-[1px] text-win"
        >你赢了 🎉</span
      >
    {:else if review.winner === "opp"}
      <span class="text-[1.8rem] font-extrabold tracking-[1px] text-lose"
        >你输了</span
      >
    {:else}
      <span class="text-[1.8rem] font-extrabold tracking-[1px] text-gold-muted"
        >平局</span
      >
    {/if}
    <span class="text-[1.1rem] tracking-[2px] text-gold-muted">
      {review.finalScore.me} : {review.finalScore.opp}
    </span>
  </div>

  <table class="w-full border-collapse text-[0.88rem]">
    <thead>
      <tr>
        <th class={th}>回合</th>
        <th class={th}>先手</th>
        <th class={th}>我的牌</th>
        <th class={th}>对手的牌</th>
        <th class={th}>结果</th>
      </tr>
    </thead>
    <tbody>
      {#each review.rounds as r (r.round)}
        <tr class={rowBg(r.result)}>
          <td class={td}>{r.round}</td>
          <td class={td}>{r.firstPlayer === "me" ? "我" : "对手"}</td>
          <td class={td}><span class={badge(r.myCard)}>{r.myCard}</span></td>
          <td class={td}><span class={badge(r.oppCard)}>{r.oppCard}</span></td>
          <td class={td}><Chip result={r.result} /></td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="flex flex-wrap items-center justify-center gap-[12px]">
    <Button on:click={rematch}>再来一局</Button>
    <Button variant="ghost" on:click={leaveRoom}>返回大厅</Button>
  </div>

  {#if $status}
    <p class="text-center text-[0.85rem] text-lose">{$status}</p>
  {/if}
</div>
