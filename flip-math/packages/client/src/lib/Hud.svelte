<script lang="ts">
  import type { ClientView } from "@fm/shared";
  import { onDestroy } from "svelte";
  import { buzz, ready, leaveRoom } from "../socket";
  import { t } from "../i18n";
  import { Button } from "@tpg/ui";
  export let view: ClientView;

  let remaining = 0;
  let confirmQuit = false;
  function tick() {
    remaining = view.deadline
      ? Math.max(0, Math.ceil((view.deadline - Date.now()) / 1000))
      : 0;
  }
  const id = setInterval(tick, 100);
  onDestroy(() => clearInterval(id));
  // view 变化时立刻刷新一次倒计时
  $: (view, tick());
</script>

<div class="flex w-full max-w-[420px] flex-col items-center gap-4">
  <div class="flex w-full items-center justify-between text-xl">
    <span class="text-ink"
      >{$t.hud.me} <b class="text-2xl text-accent">{view.scores.me}</b></span
    >
    {#if confirmQuit}
      <span class="flex items-center gap-3 text-sm">
        <button
          class="cursor-pointer text-danger underline"
          on:click={leaveRoom}>{$t.hud.quitYes}</button
        >
        <button
          class="cursor-pointer text-muted underline"
          on:click={() => (confirmQuit = false)}>{$t.hud.cancel}</button
        >
      </span>
    {:else}
      <button
        class="cursor-pointer text-sm text-muted underline"
        on:click={() => (confirmQuit = true)}>{$t.hud.quit}</button
      >
    {/if}
    <span class="text-ink"
      >{$t.hud.opponent}
      <b class="text-2xl text-accent">{view.scores.opp}</b></span
    >
  </div>

  {#if view.target !== null && view.phase !== "finished"}
    <div class="text-center">
      <div class="text-sm tracking-widest text-muted">{$t.hud.target}</div>
      <div class="text-[60px] font-bold leading-none text-accent">
        {view.target}
      </div>
    </div>
  {/if}

  {#if view.deadline && view.phase !== "countdown"}
    <div class="text-xl text-ink">⏱ {remaining}s</div>
  {/if}

  {#if view.phase === "ready"}
    {#if view.ready.me}
      <p class="text-lg text-ink">{$t.hud.readyWaiting}</p>
    {:else}
      <Button on:click={ready}>{$t.hud.ready}</Button>
    {/if}
    <p class="text-sm text-muted">
      {$t.hud.readyMark(view.ready.me)} ｜ {$t.hud.readyMarkOpp(view.ready.opp)}
    </p>
  {:else if view.phase === "preview"}
    <p class="text-lg text-muted">{$t.hud.memorize}</p>
  {:else if view.phase === "countdown"}
    <div class="text-[64px] font-bold leading-none text-accent">
      {remaining}
    </div>
  {:else if view.phase === "buzzing"}
    <Button on:click={buzz}>{$t.hud.buzz}</Button>
  {:else if view.phase === "answering"}
    <p class="text-lg text-ink">
      {view.iAmActive ? $t.hud.yourAnswer : $t.hud.opponentAnswering}
    </p>
  {:else if view.phase === "resolve"}
    <p class="text-lg text-ink">{$t.hud.revealing}</p>
  {:else if view.phase === "reveal"}
    <p class="text-lg text-muted">{$t.hud.memoryHint}</p>
  {/if}
</div>
