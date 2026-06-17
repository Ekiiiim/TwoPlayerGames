<script lang="ts">
  import type { GameReview } from '@bw/shared';
  import { rematch, leaveRoom, status } from '../socket';

  export let review: GameReview;

  const label: Record<string, string> = { win: '胜', lose: '负', draw: '平' };
</script>

<div class="review-card">
  <div class="result-header">
    {#if review.winner === 'me'}
      <span class="result-text win">你赢了 🎉</span>
    {:else if review.winner === 'opp'}
      <span class="result-text lose">你输了</span>
    {:else}
      <span class="result-text draw">平局</span>
    {/if}
    <span class="final-score">{review.finalScore.me} : {review.finalScore.opp}</span>
  </div>

  <table class="round-table">
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
        <tr class:row-win={r.result === 'win'} class:row-lose={r.result === 'lose'}>
          <td>{r.round}</td>
          <td>{r.firstPlayer === 'me' ? '我' : '对手'}</td>
          <td>
            <span class="card-badge" class:cb-black={r.myCard % 2 === 0} class:cb-white={r.myCard % 2 !== 0}>
              {r.myCard}
            </span>
          </td>
          <td>
            <span class="card-badge" class:cb-black={r.oppCard % 2 === 0} class:cb-white={r.oppCard % 2 !== 0}>
              {r.oppCard}
            </span>
          </td>
          <td>
            <span class="chip chip-{r.result}">{label[r.result]}</span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="end-actions">
    <button class="btn-primary" on:click={rematch}>再来一局</button>
    <button class="btn-ghost" on:click={leaveRoom}>返回大厅</button>
  </div>

  {#if $status}
    <p class="status-msg">{$status}</p>
  {/if}
</div>

<style>
  .review-card {
    background: var(--felt);
    border-radius: 20px;
    padding: 36px 40px;
    max-width: 600px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    border: 1px solid rgba(217,178,91,0.2);
  }

  .result-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .result-text {
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: 1px;
  }

  .result-text.win  { color: #6fcf97; }
  .result-text.lose { color: #e57373; }
  .result-text.draw { color: var(--gold-muted); }

  .final-score {
    font-size: 1.1rem;
    color: var(--gold-muted);
    letter-spacing: 2px;
  }

  .round-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.88rem;
  }

  th {
    color: var(--gold-muted);
    font-weight: 600;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    text-align: center;
    letter-spacing: 0.5px;
  }

  td {
    padding: 8px 12px;
    text-align: center;
    color: var(--felt-text);
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }

  .row-win td { background: rgba(46,160,67,0.1); }
  .row-lose td { background: rgba(192,57,43,0.1); }

  .card-badge {
    display: inline-block;
    width: 28px;
    height: 38px;
    border-radius: 4px;
    line-height: 38px;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: center;
    border: 1px solid transparent;
  }

  .cb-black {
    background: var(--card-black-bg);
    color: var(--card-black-text);
    border-color: var(--card-black-border);
  }

  .cb-white {
    background: var(--card-white-bg);
    color: var(--card-white-text);
    border-color: var(--card-white-border);
  }

  .chip {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .chip-win {
    background: rgba(46,160,67,0.25);
    color: #6fcf97;
    border: 1px solid rgba(46,160,67,0.4);
  }

  .chip-lose {
    background: rgba(192,57,43,0.2);
    color: #e57373;
    border: 1px solid rgba(192,57,43,0.35);
  }

  .chip-draw {
    background: rgba(203,185,138,0.15);
    color: var(--gold-muted);
    border: 1px solid rgba(203,185,138,0.3);
  }

  .btn-primary {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
    border: none;
    border-radius: 8px;
    padding: 12px 40px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: opacity 0.15s;
  }

  .btn-primary:hover { opacity: 0.88; }

  .end-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-ghost {
    background: transparent;
    color: var(--btn-ghost-text);
    border: 1px solid var(--btn-ghost-border);
    border-radius: 8px;
    padding: 12px 28px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }

  .btn-ghost:hover {
    border-color: var(--gold-muted);
    color: var(--felt-text);
  }

  .status-msg {
    color: #e57373;
    font-size: 0.85rem;
    text-align: center;
  }
</style>
