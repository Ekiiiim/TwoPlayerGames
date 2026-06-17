<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { colorOf } from '@bw/shared';

  export let cards: number[];
  export let myTurn: boolean;
  export let selected: number | null = null;

  const dispatch = createEventDispatcher<{ select: number }>();

  function handleClick(c: number): void {
    if (!myTurn) return;
    dispatch('select', c);
  }
</script>

<div class="hand">
  {#each cards as c (c)}
    <button
      class="card-face"
      class:black-card={colorOf(c) === 'black'}
      class:white-card={colorOf(c) === 'white'}
      class:selected={selected === c}
      class:lifted={selected === c}
      disabled={!myTurn}
      on:click={() => handleClick(c)}
      aria-pressed={selected === c}
    >
      <span class="card-num">{c}</span>
    </button>
  {/each}
</div>

<style>
  .hand {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
    padding: 8px 0 16px;
  }

  .card-face {
    width: 38px;
    height: 54px;
    border-radius: 6px;
    border: 2px solid transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-weight: 500;
    font-size: 1rem;
    transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s;
    position: relative;
    top: 0;
  }

  .card-face:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .black-card {
    background: var(--card-black-bg);
    color: var(--card-black-text);
    border-color: var(--card-black-border);
  }

  .white-card {
    background: var(--card-white-bg);
    color: var(--card-white-text);
    border-color: var(--card-white-border);
  }

  .card-face:not(:disabled):hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }

  .selected {
    border-color: var(--gold) !important;
    box-shadow: 0 0 0 2px var(--gold), 0 6px 16px rgba(0,0,0,0.5) !important;
  }

  .lifted {
    transform: translateY(-8px) !important;
  }

  .card-num {
    pointer-events: none;
    user-select: none;
  }
</style>
