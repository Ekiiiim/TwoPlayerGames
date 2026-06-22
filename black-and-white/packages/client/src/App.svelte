<script lang="ts">
  import { onMount } from "svelte";
  import { view, review, ended, tryRejoin, leaveRoom } from "./socket";
  import Lobby from "./lib/Lobby.svelte";
  import Table from "./lib/Table.svelte";
  import Review from "./lib/Review.svelte";
  import Button from "./lib/Button.svelte";

  onMount(tryRejoin);
</script>

<div class="flex min-h-screen w-full items-center justify-center">
  {#if $ended}
    <div class="flex w-full items-center justify-center">
      <div
        class="flex max-w-[400px] flex-col items-center gap-[28px] rounded-[16px] border-2 border-gold bg-felt px-[56px] py-[48px] text-center"
      >
        <p class="text-[1.4rem] font-semibold leading-[1.5] text-felt-text">
          {$ended}
        </p>
        <Button on:click={leaveRoom}>返回大厅</Button>
      </div>
    </div>
  {:else if $review}
    <Review review={$review} />
  {:else if $view}
    <Table view={$view} />
  {:else}
    <Lobby />
  {/if}
</div>
