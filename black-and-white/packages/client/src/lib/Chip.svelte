<script lang="ts">
  import type { RoundResult } from "@bw/shared";

  export let result: RoundResult;

  const styles: Record<RoundResult, string> = {
    win: "bg-[rgba(46,160,67,0.25)] text-win border-[rgba(46,160,67,0.4)]",
    lose: "bg-[rgba(192,57,43,0.2)] text-lose border-[rgba(192,57,43,0.35)]",
    draw: "bg-[rgba(203,185,138,0.15)] text-gold-muted border-[rgba(203,185,138,0.3)]",
  };
  const label: Record<RoundResult, string> = {
    win: "胜",
    lose: "负",
    draw: "平",
  };
</script>

<span
  class={`inline-block rounded-full border px-2.5 py-0.5 text-[0.78rem] font-semibold tracking-[0.5px] ${styles[result]}`}
>
  {label[result]}
</span>
