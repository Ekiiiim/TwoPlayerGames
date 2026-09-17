<script lang="ts">
  import { createRoom, joinRoom, leaveRoom, roomCode, status } from "../socket";
  import { t } from "../i18n";
  import Button from "./Button.svelte";
  let code = "";
</script>

<div
  class="flex w-full max-w-[420px] flex-col items-center gap-[20px] rounded-[20px] border border-[rgba(217,178,91,0.2)] bg-felt px-[52px] py-[48px] shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
>
  <h1 class="m-0 text-[2.2rem] font-extrabold tracking-[4px] text-gold">
    {$t.title}
  </h1>
  <p class="text-[0.85rem] tracking-[1px] text-gold-muted">
    {$t.subtitle}
  </p>

  <div class="h-px w-full bg-white/[0.08]"></div>

  <div class="flex w-full flex-col items-center gap-[14px]">
    {#if $roomCode}
      <Button variant="ghost" class="w-full" on:click={leaveRoom}
        >{$t.lobby.closeRoom}</Button
      >
      <div
        class="flex w-full flex-col items-center gap-[4px] rounded-[10px] border border-[rgba(217,178,91,0.25)] bg-black/20 px-[28px] py-[14px]"
      >
        <span class="text-[0.75rem] uppercase tracking-[1px] text-gold-muted"
          >{$t.lobby.roomCode}</span
        >
        <strong class="text-[2rem] font-extrabold tracking-[6px] text-gold"
          >{$roomCode}</strong
        >
        <span class="mt-[2px] text-[0.78rem] text-gold-muted"
          >{$t.lobby.waitingOpponent}</span
        >
      </div>
    {:else}
      <Button class="w-full" on:click={createRoom}>{$t.lobby.createRoom}</Button
      >
    {/if}
  </div>

  <div class="h-px w-full bg-white/[0.08]"></div>

  <div class="flex w-full flex-col items-center gap-[14px]">
    <input
      class="w-full rounded-[8px] border border-btn-ghost-border bg-black/25 px-[16px] py-[12px] text-center font-mono text-[1.1rem] uppercase tracking-[4px] text-felt-text outline-none transition focus:border-gold-muted placeholder:font-sans placeholder:tracking-[1px] placeholder:text-[rgba(203,185,138,0.4)]"
      placeholder={$t.lobby.codePlaceholder}
      bind:value={code}
      maxlength="6"
    />
    <Button
      class="w-full"
      on:click={() => joinRoom(code.trim().toUpperCase())}
      disabled={code.trim().length !== 6}
    >
      {$t.lobby.join}
    </Button>
  </div>

  {#if $status}
    <p class="text-center text-[0.85rem] text-lose">{$t.status[$status]}</p>
  {/if}
</div>
