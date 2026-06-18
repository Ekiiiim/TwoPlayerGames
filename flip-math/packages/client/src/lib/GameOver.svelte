<script lang="ts">
  import type { ClientView } from '@fm/shared';
  import { rematch, leaveRoom, status } from '../socket';
  import Button from './Button.svelte';
  export let view: ClientView;
</script>

<div class="flex flex-col items-center gap-6 rounded-[16px] border-2 border-accent bg-panel px-14 py-12 text-center">
  <p class="text-3xl font-bold {view.winner === 'me' ? 'text-win' : 'text-danger'}">
    {view.winner === 'me' ? '你赢了 🎉' : '你输了'}
  </p>
  <p class="text-xl text-ink">{view.scores.me} : {view.scores.opp}</p>
  <div class="flex gap-3">
    <Button on:click={rematch}>再来一局</Button>
    <Button variant="ghost" on:click={leaveRoom}>返回大厅</Button>
  </div>
  {#if $status}<p class="text-danger">{$status}</p>{/if}
</div>
