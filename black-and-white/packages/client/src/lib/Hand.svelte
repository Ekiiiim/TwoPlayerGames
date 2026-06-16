<script lang="ts">
  import { playCard } from '../socket';
  export let cards: number[];
  export let myTurn: boolean;

  function colorLabel(c: number): string {
    return c % 2 === 0 ? '黑' : '白';
  }
</script>

<div class="hand">
  {#each cards as c (c)}
    <button class:black={c % 2 === 0} disabled={!myTurn} on:click={() => playCard(c)}>
      {c}<small>{colorLabel(c)}</small>
    </button>
  {/each}
</div>

<style>
  .hand { display: flex; gap: 8px; flex-wrap: wrap; }
  button { width: 48px; height: 64px; font-size: 20px; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .black { background: #222; color: #fff; }
</style>
