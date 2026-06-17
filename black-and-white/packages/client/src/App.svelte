<script lang="ts">
  import { onMount } from 'svelte';
  import { view, review, ended, tryRejoin, leaveRoom } from './socket';
  import Lobby from './lib/Lobby.svelte';
  import Table from './lib/Table.svelte';
  import Review from './lib/Review.svelte';

  onMount(tryRejoin);
</script>

<div class="shell">
  {#if $ended}
    <div class="end-screen">
      <div class="end-card">
        <p class="end-msg">{$ended}</p>
        <button class="btn-primary" on:click={leaveRoom}>返回大厅</button>
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

<style>
  .shell {
    width: 100%;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .end-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .end-card {
    background: var(--felt);
    border: 2px solid var(--gold);
    border-radius: 16px;
    padding: 48px 56px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    max-width: 400px;
  }

  .end-msg {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--felt-text);
    line-height: 1.5;
  }

  .btn-primary {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
    border: none;
    border-radius: 8px;
    padding: 12px 32px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: opacity 0.15s;
  }
  .btn-primary:hover { opacity: 0.88; }
</style>
