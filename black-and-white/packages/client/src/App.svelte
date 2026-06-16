<script lang="ts">
  import { onMount } from 'svelte';
  import { view, review, tryRejoin } from './socket';
  import Lobby from './lib/Lobby.svelte';
  import Table from './lib/Table.svelte';
  import Review from './lib/Review.svelte';

  onMount(tryRejoin);
</script>

<main>
  <h1>黑与白</h1>
  {#if $review}
    <Review review={$review} />
  {:else if $view}
    <Table view={$view} />
  {:else}
    <Lobby />
  {/if}
</main>
