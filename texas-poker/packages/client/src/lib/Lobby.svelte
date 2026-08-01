<script lang="ts">
  import { createRoom, joinRoom, leaveRoom, roomCode, status } from "../socket";
  import Button from "./Button.svelte";

  export let lang: "zh" | "en" = "zh";

  let code = "";

  const text = {
    zh: {
      title: "Texas Poker",
      subtitle: "双人 heads-up 德州扑克",
      roomCode: "房间码",
      waiting: "等待第二位玩家加入",
      dissolve: "解散房间",
      create: "创建房间",
      join: "加入",
    },
    en: {
      title: "Texas Poker",
      subtitle: "Two-player heads-up poker",
      roomCode: "Room code",
      waiting: "Waiting for player two",
      dissolve: "Dissolve room",
      create: "Create room",
      join: "Join",
    },
  } as const;

  $: copy = text[lang];

  function submitJoin(): void {
    if (code.trim()) joinRoom(code);
  }
</script>

<section
  class="flex w-full max-w-[420px] flex-col gap-5 rounded-[12px] border border-[rgba(217,178,91,0.25)] bg-felt p-6 shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
>
  <div class="space-y-2 text-center">
    <h1 class="text-2xl font-black text-felt-text">{copy.title}</h1>
    <p class="text-sm leading-6 text-gold-muted">{copy.subtitle}</p>
  </div>

  {#if $roomCode}
    <div class="rounded-[10px] border border-gold bg-black/20 p-4 text-center">
      <p class="text-sm font-semibold text-gold-muted">{copy.roomCode}</p>
      <p class="mt-1 text-4xl font-black tracking-[0.12em] text-felt-text">
        {$roomCode}
      </p>
      <p class="mt-2 text-sm text-gold-muted">{copy.waiting}</p>
    </div>
    <Button variant="danger" on:click={leaveRoom}>{copy.dissolve}</Button>
  {:else}
    <Button on:click={createRoom}>{copy.create}</Button>
    <form class="flex gap-2" on:submit|preventDefault={submitJoin}>
      <input
        class="min-h-[44px] min-w-0 flex-1 rounded-[8px] border border-line bg-panel px-3 text-center text-base font-semibold uppercase tracking-[0.08em] text-ink outline-none focus:border-gold"
        bind:value={code}
        maxlength="6"
        placeholder={copy.roomCode}
      />
      <Button variant="secondary" disabled={!code.trim()}>{copy.join}</Button>
    </form>
  {/if}

  {#if $status}
    <p
      class="rounded-[8px] border border-danger/40 bg-black/20 px-3 py-2 text-sm text-danger"
    >
      {$status}
    </p>
  {/if}
</section>
