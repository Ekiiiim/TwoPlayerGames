<script lang="ts">
  import type { ClientView } from "@fm/shared";
  import { rematch, leaveRoom, status } from "../socket";
  import { t } from "../i18n";
  import Button from "./Button.svelte";
  export let view: ClientView;
</script>

<div
  class="flex flex-col items-center gap-6 rounded-[16px] border-2 border-accent bg-panel px-14 py-12 text-center"
>
  <p
    class="text-4xl font-bold {view.winner === 'me'
      ? 'text-win'
      : 'text-danger'}"
  >
    {view.winner === "me" ? $t.gameOver.win : $t.gameOver.lose}
  </p>
  <p class="text-3xl font-bold text-ink">
    {view.scores.me} : {view.scores.opp}
  </p>
  <div class="flex gap-3">
    <Button on:click={rematch}>{$t.gameOver.rematch}</Button>
    <Button variant="ghost" on:click={leaveRoom}>{$t.backToLobby}</Button>
  </div>
  {#if $status}<p class="text-danger">{$t.status[$status]}</p>{/if}
</div>
