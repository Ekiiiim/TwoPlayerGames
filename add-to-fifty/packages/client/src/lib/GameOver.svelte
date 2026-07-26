<script lang="ts">
  import type { ClientView } from "@add-to-fifty/shared";
  import { leaveRoom, rematch } from "../socket";
  import Button from "./Button.svelte";

  export let view: ClientView;
</script>

<section
  class="flex w-full max-w-[520px] flex-col items-center gap-5 rounded-[8px] border border-line bg-panel p-7 text-center shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
>
  <div class="space-y-2">
    <p class="text-sm font-semibold uppercase text-muted">最终累积分</p>
    <p
      class="text-6xl font-black"
      class:text-success={view.winner === "me"}
      class:text-danger={view.loser === "me"}
    >
      {view.discardTotal}
    </p>
  </div>

  <h2 class="text-2xl font-bold text-ink">
    {view.winner === "me" ? "你赢了" : "你输了"}
  </h2>

  <div class="flex flex-wrap justify-center gap-3">
    <Button on:click={rematch}>再来一局</Button>
    <Button variant="secondary" on:click={leaveRoom}>返回大厅</Button>
  </div>
</section>
