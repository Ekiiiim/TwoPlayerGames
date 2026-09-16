<script lang="ts">
  import { createRoom, joinRoom, leaveRoom, roomCode, status } from "../socket";
  import { t } from "../i18n";
  import Button from "./Button.svelte";

  let code = "";

  function submitJoin(): void {
    if (code.trim()) joinRoom(code);
  }
</script>

<section
  class="flex w-full max-w-[420px] flex-col gap-5 rounded-[8px] border border-line bg-panel p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
>
  <div class="space-y-2">
    <h1 class="text-2xl font-bold text-ink">{$t.title}</h1>
    <p class="text-sm leading-6 text-muted">
      {$t.tagline}
    </p>
  </div>

  {#if $roomCode}
    <div class="rounded-[8px] border border-accent bg-white p-4 text-center">
      <p class="text-sm font-semibold text-muted">{$t.lobby.roomCode}</p>
      <p class="mt-1 text-4xl font-black tracking-[0.12em] text-ink">
        {$roomCode}
      </p>
      <p class="mt-2 text-sm text-muted">{$t.lobby.waitingOpponent}</p>
    </div>
    <Button variant="danger" on:click={leaveRoom}>{$t.lobby.closeRoom}</Button>
  {:else}
    <Button on:click={createRoom}>{$t.lobby.createRoom}</Button>

    <form class="flex gap-2" on:submit|preventDefault={submitJoin}>
      <input
        class="min-h-[44px] min-w-0 flex-1 rounded-[8px] border border-line bg-white px-3 text-center text-base font-semibold uppercase tracking-[0.08em] text-ink outline-none focus:border-accent"
        bind:value={code}
        maxlength="6"
        placeholder={$t.lobby.codePlaceholder}
      />
      <Button variant="secondary" disabled={!code.trim()}
        >{$t.lobby.join}</Button
      >
    </form>
  {/if}

  {#if $status}
    <p
      class="rounded-[8px] border border-danger/40 bg-white px-3 py-2 text-sm text-danger"
    >
      {$t.status[$status]}
    </p>
  {/if}
</section>
