<script lang="ts">
  import { onMount } from "svelte";
  import { Button, LangToggle, Lobby } from "@tpg/ui";
  import {
    view,
    review,
    ended,
    roomCode,
    status,
    createRoom,
    joinRoom,
    tryRejoin,
    leaveRoom,
  } from "./socket";
  import { lang, t, toggleLang } from "./i18n";
  import Table from "./lib/Table.svelte";
  import Review from "./lib/Review.svelte";

  onMount(tryRejoin);
</script>

<div class="flex min-h-screen w-full items-center justify-center">
  <LangToggle lang={$lang} onToggle={toggleLang} />
  {#if $ended}
    <div class="flex w-full items-center justify-center">
      <div
        class="flex max-w-[400px] flex-col items-center gap-[28px] rounded-[16px] border-2 border-gold bg-felt px-[56px] py-[48px] text-center"
      >
        <p class="text-[1.4rem] font-semibold leading-[1.5] text-felt-text">
          {$t.ended[$ended]}
        </p>
        <Button on:click={leaveRoom}>{$t.backToLobby}</Button>
      </div>
    </div>
  {:else if $review}
    <Review review={$review} />
  {:else if $view}
    <Table view={$view} />
  {:else}
    <Lobby
      title={$t.title}
      subtitle={$t.subtitle}
      copy={$t.lobby}
      statusText={$status ? $t.status[$status] : null}
      roomCode={$roomCode}
      onCreate={createRoom}
      onJoin={joinRoom}
      onClose={leaveRoom}
    />
  {/if}
</div>
