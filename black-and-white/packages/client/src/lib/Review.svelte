<script lang="ts">
  import type { GameReview } from '@bw/shared';

  export let review: GameReview;

  const label: Record<string, string> = { win: '胜', lose: '负', draw: '平' };

  function reset(): void {
    localStorage.removeItem('bw_token');
    localStorage.removeItem('bw_room');
    location.reload();
  }
</script>

<section>
  <h2>
    {#if review.winner === 'me'}你赢了 🎉
    {:else if review.winner === 'opp'}你输了
    {:else}平局{/if}
    （{review.finalScore.me} : {review.finalScore.opp}）
  </h2>

  <table>
    <thead>
      <tr>
        <th>回合</th>
        <th>先手</th>
        <th>我的牌</th>
        <th>对手的牌</th>
        <th>结果</th>
      </tr>
    </thead>
    <tbody>
      {#each review.rounds as r (r.round)}
        <tr class:win={r.result === 'win'} class:lose={r.result === 'lose'}>
          <td>{r.round}</td>
          <td>{r.firstPlayer === 'me' ? '我' : '对手'}</td>
          <td>{r.myCard}（{r.myCard % 2 === 0 ? '黑' : '白'}）</td>
          <td>{r.oppCard}（{r.oppCard % 2 === 0 ? '黑' : '白'}）</td>
          <td>{label[r.result]}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <button on:click={reset}>再来一局</button>
</section>

<style>
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 10px; text-align: center; }
  .win { background: #e6ffe6; }
  .lose { background: #ffecec; }
</style>
