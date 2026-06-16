<script lang="ts">
  import type { ClientView } from '@bw/shared';
  import Hand from './Hand.svelte';
  import { status, playCard, leaveRoom } from '../socket';

  export let view: ClientView;

  let selectedCard: number | null = null;
  let showLeaveModal = false;

  $: cr = view.currentRound;
  $: myTurn = view.turn === 'me' && view.phase === 'playing';
  $: canConfirm = selectedCard !== null && myTurn;

  // Reset selection whenever a new view arrives (round advanced)
  $: { view; selectedCard = null; }

  function onSelect(e: CustomEvent<number>): void {
    if (!myTurn) return;
    selectedCard = e.detail === selectedCard ? null : e.detail;
  }

  function onConfirm(): void {
    if (!canConfirm || selectedCard === null) return;
    playCard(selectedCard);
    selectedCard = null;
  }

  function openLeaveModal(): void {
    showLeaveModal = true;
  }

  function closeLeaveModal(): void {
    showLeaveModal = false;
  }

  function confirmLeave(): void {
    showLeaveModal = false;
    leaveRoom();
  }

  function isBlack(c: number): boolean {
    return c % 2 === 0;
  }

  const resultLabel: Record<string, string> = { win: '胜', lose: '负', draw: '平' };
  const colorLabel: Record<string, string> = { black: '黑', white: '白' };

  $: blackBacks = Array(view.opponentRemaining.black).fill('black');
  $: whiteBacks = Array(view.opponentRemaining.white).fill('white');
  $: oppBacks = [...blackBacks, ...whiteBacks];
</script>

<div class="table-wrap">
  <div class="table-surface">

    <!-- ── Top: Opponent Seat ── -->
    <div class="seat seat-opp">
      <div class="seat-info">
        <div class="avatar avatar-opp">对</div>
        <div class="seat-meta">
          <span class="seat-name">对手</span>
          <span class="cards-left">剩 {view.opponentCardsLeft} 张</span>
        </div>
      </div>

      <!-- Opponent's hand as colored face-down backs -->
      <div class="opp-hand">
        {#each oppBacks as color, i (i + '-' + color)}
          <div class="card-back back-{color}"></div>
        {/each}
      </div>

      <!-- Opponent played-colors history dots -->
      {#if view.opponentPlayedColors.length > 0}
        <div class="color-dots">
          {#each view.opponentPlayedColors as c, i (i)}
            <span class="dot dot-{c}" title={colorLabel[c]}></span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Center Strip ── -->
    <div class="center-strip">
      <div class="round-pill">第 {cr.index} / 9 回合</div>

      <div class="score-display">
        我 <span class="score-num">{view.scores.me}</span>
        <span class="score-sep">:</span>
        <span class="score-num">{view.scores.opp}</span> 对手
      </div>

      <!-- Play zone -->
      <div class="play-zone">
        {#if cr.iAmLeader && !cr.leaderHasPlayed && view.turn === 'me'}
          <p class="zone-caption lead">轮到你先出牌</p>
        {:else if !cr.iAmLeader && cr.leaderHasPlayed}
          <div class="zone-follow">
            <div class="card-back back-{cr.leaderColor ?? 'black'} back-lg"></div>
            <p class="zone-caption">对方出牌（{colorLabel[cr.leaderColor ?? 'black']}）</p>
            {#if view.turn === 'me'}
              <p class="zone-caption follow">轮到你出牌</p>
            {/if}
          </div>
        {:else if view.turn === 'opp'}
          <p class="zone-caption wait">等待对手出牌…</p>
        {/if}
      </div>

      <!-- Round results history -->
      {#if view.roundResults.length > 0}
        <div class="results-row">
          {#each view.roundResults as r, i (i)}
            <span class="chip chip-{r}">{resultLabel[r]}</span>
          {/each}
        </div>
      {/if}

      {#if $status}
        <p class="status-msg">{$status}</p>
      {/if}
    </div>

    <!-- ── Bottom: My Seat ── -->
    <div class="seat seat-me">
      <div class="seat-info seat-info-me">
        <div class="avatar avatar-me">你</div>
        <div class="seat-meta">
          <span class="seat-name">我</span>
        </div>
      </div>

      <Hand cards={view.myHand} {myTurn} selected={selectedCard} on:select={onSelect} />

      <div class="action-bar">
        <button
          class="btn-primary confirm-btn"
          disabled={!canConfirm}
          on:click={onConfirm}
        >
          确认出牌{selectedCard !== null ? ` · ${selectedCard}` : ''}
        </button>
        <button class="btn-ghost leave-btn" on:click={openLeaveModal}>
          退出牌局
        </button>
      </div>
    </div>

  </div>
</div>

<!-- ── Leave-game confirmation modal ── -->
{#if showLeaveModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div class="modal-backdrop" on:click|self={closeLeaveModal} role="dialog" aria-modal="true">
    <div class="modal-box">
      <p class="modal-text">确定退出？退出将判负，对手获胜。</p>
      <div class="modal-actions">
        <button class="btn-danger" on:click={confirmLeave}>确认退出</button>
        <button class="btn-ghost" on:click={closeLeaveModal}>取消</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .table-wrap {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
  }

  .table-surface {
    background: var(--felt);
    border-radius: 20px;
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 0;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    border: 1px solid rgba(217,178,91,0.15);
  }

  /* ── Seats ── */
  .seat {
    padding: 16px 0;
  }

  .seat-opp {
    border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .seat-me {
    border-top: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .seat-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .seat-info-me {
    flex-direction: row-reverse;
  }

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1rem;
    flex-shrink: 0;
  }

  .avatar-opp {
    background: rgba(217,178,91,0.18);
    border: 2px solid var(--gold);
    color: var(--gold);
  }

  .avatar-me {
    background: rgba(217,178,91,0.25);
    border: 2px solid var(--gold);
    color: var(--gold);
  }

  .seat-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .seat-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--felt-text);
    letter-spacing: 0.5px;
  }

  .cards-left {
    font-size: 0.78rem;
    color: var(--gold-muted);
  }

  /* ── Opponent hand backs ── */
  .opp-hand {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .card-back {
    width: 26px;
    height: 38px;
    border-radius: 4px;
    border: 2px solid transparent;
    flex-shrink: 0;
  }

  .back-black {
    background: var(--back-black-bg);
    border-color: var(--back-black-border);
  }

  .back-white {
    background: var(--back-white-bg);
    border-color: var(--back-white-border);
  }

  .back-lg {
    width: 38px;
    height: 54px;
    border-radius: 6px;
  }

  /* ── Color-dots history ── */
  .color-dots {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-black {
    background: #2a2d32;
    border: 1px solid #555;
  }

  .dot-white {
    background: #e8e6df;
    border: 1px solid #bbb;
  }

  /* ── Center strip ── */
  .center-strip {
    padding: 20px 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .round-pill {
    background: rgba(0,0,0,0.25);
    border: 1px solid rgba(217,178,91,0.3);
    color: var(--gold-muted);
    border-radius: 100px;
    padding: 4px 20px;
    font-size: 0.82rem;
    letter-spacing: 1px;
  }

  .score-display {
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--felt-text);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .score-num {
    color: var(--gold);
    min-width: 2ch;
    text-align: center;
  }

  .score-sep {
    color: var(--gold-muted);
    font-weight: 400;
  }

  /* ── Play zone ── */
  .play-zone {
    min-height: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
  }

  .zone-caption {
    font-size: 0.9rem;
    color: var(--gold-muted);
    text-align: center;
  }

  .zone-caption.lead {
    color: var(--felt-text);
    font-weight: 600;
  }

  .zone-caption.follow {
    color: var(--felt-text);
    font-weight: 600;
  }

  .zone-caption.wait {
    color: var(--gold-muted);
    font-style: italic;
  }

  .zone-follow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  /* ── Results row ── */
  .results-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .chip {
    padding: 2px 10px;
    border-radius: 100px;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.5px;
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

  .status-msg {
    color: #e57373;
    font-size: 0.85rem;
    text-align: center;
  }

  /* ── Action bar ── */
  .action-bar {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-primary {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
    border: none;
    border-radius: 8px;
    padding: 10px 28px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: opacity 0.15s;
    white-space: nowrap;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-primary:not(:disabled):hover {
    opacity: 0.88;
  }

  .confirm-btn {
    min-width: 160px;
  }

  .btn-ghost {
    background: transparent;
    color: var(--btn-ghost-text);
    border: 1px solid var(--btn-ghost-border);
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    white-space: nowrap;
  }

  .btn-ghost:hover {
    border-color: var(--gold-muted);
    color: var(--felt-text);
  }

  /* ── Modal ── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-box {
    background: var(--felt);
    border: 2px solid var(--gold);
    border-radius: 14px;
    padding: 32px 40px;
    max-width: 360px;
    width: 90%;
    display: flex;
    flex-direction: column;
    gap: 24px;
    align-items: center;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  }

  .modal-text {
    font-size: 1rem;
    color: var(--felt-text);
    text-align: center;
    line-height: 1.6;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
  }

  .btn-danger {
    background: var(--danger);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 24px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-danger:hover {
    opacity: 0.88;
  }
</style>
