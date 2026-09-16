<script lang="ts">
  import { createRoom, joinRoom, leaveRoom, roomCode, status } from "../socket";
  import { t } from "../i18n";
  import Button from "./Button.svelte";
  let code = "";
  let confirmDisband = false;
</script>

<div
  class="flex w-full max-w-[380px] flex-col items-center gap-6 rounded-[16px] border border-line bg-panel p-8"
>
  <h1 class="text-4xl font-bold text-accent">{$t.title}</h1>

  {#if $roomCode}
    <p class="text-muted">{$t.lobby.roomCode}</p>
    <p class="font-mono text-4xl tracking-[8px] text-accent">{$roomCode}</p>
    <p class="text-muted">{$t.lobby.waitingOpponent}</p>
    {#if confirmDisband}
      <div class="flex items-center gap-3">
        <Button
          variant="danger"
          on:click={() => {
            confirmDisband = false;
            leaveRoom();
          }}>{$t.lobby.confirmClose}</Button
        >
        <Button variant="ghost" on:click={() => (confirmDisband = false)}
          >{$t.lobby.cancel}</Button
        >
      </div>
    {:else}
      <Button variant="ghost" on:click={() => (confirmDisband = true)}
        >{$t.lobby.closeRoom}</Button
      >
    {/if}
  {:else}
    <Button class="w-full" on:click={createRoom}>{$t.lobby.createRoom}</Button>
    <div class="flex w-full items-center gap-2">
      <input
        class="flex-1 rounded-[10px] border border-line bg-bg px-3 py-2 uppercase tracking-widest text-ink outline-none focus:border-accent"
        maxlength="6"
        bind:value={code}
        placeholder={$t.lobby.codePlaceholder}
      />
      <Button on:click={() => joinRoom(code.trim().toUpperCase())}>
        {$t.lobby.join}
      </Button>
    </div>
  {/if}

  {#if $status}<p class="text-danger">{$t.status[$status]}</p>{/if}
</div>
