<script lang="ts">
  import { onMount } from 'svelte';
  import { view, ended, tryRejoin, leaveRoom } from './socket';
  import Lobby from './lib/Lobby.svelte';
  import Board from './lib/Board.svelte';
  import Hud from './lib/Hud.svelte';
  import GameOver from './lib/GameOver.svelte';
  import Button from './lib/Button.svelte';

  onMount(tryRejoin);
</script>

<div class="flex min-h-screen w-full flex-col items-center justify-center gap-6">
  {#if $ended}
    <div class="flex flex-col items-center gap-7 rounded-[16px] border-2 border-accent bg-panel px-14 py-12 text-center">
      <p class="text-[1.4rem] font-semibold leading-[1.5] text-ink">{$ended}</p>
      <Button on:click={leaveRoom}>返回大厅</Button>
    </div>
  {:else if $view && $view.phase === 'finished'}
    <GameOver view={$view} />
  {:else if $view}
    <Hud view={$view} />
    <Board view={$view} />
  {:else}
    <Lobby />
  {/if}
</div>
