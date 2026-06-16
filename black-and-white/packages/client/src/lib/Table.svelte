<script lang="ts">
  import type { ClientView } from '@bw/shared';
  import Hand from './Hand.svelte';
  import { status } from '../socket';

  export let view: ClientView;

  $: cr = view.currentRound;
  $: myTurn = view.turn === 'me' && view.phase === 'playing';
  // followerHasPlayed was removed from ClientView; infer follower state from leaderHasPlayed alone
  $: waitingForMeAsFollower = !cr.iAmLeader && cr.leaderHasPlayed;

  const resultLabel: Record<string, string> = { win: '胜', lose: '负', draw: '平' };
  const colorLabel: Record<string, string> = { black: '黑', white: '白' };
</script>

<section>
  <p>第 {cr.index} / 9 回合 — 比分 我 {view.scores.me} : {view.scores.opp} 对手</p>

  <p>
    本回合先手：{cr.iAmLeader ? '我' : '对手'}
    {#if cr.leaderHasPlayed && cr.leaderColor}
      ｜先手出了一张 <strong>{colorLabel[cr.leaderColor]}</strong> 牌
    {/if}
  </p>

  {#if myTurn}
    <p class="turn">{waitingForMeAsFollower ? '看到对手颜色了，轮到你出牌' : '轮到你先出牌'}</p>
  {:else}
    <p class="turn">等待对手出牌…</p>
  {/if}

  <p>
    对手剩牌：{view.opponentCardsLeft}　对手已出颜色：
    {view.opponentPlayedColors.map((c) => colorLabel[c]).join(' ')}
  </p>

  <p>历史结果：{view.roundResults.map((r) => resultLabel[r]).join(' ')}</p>

  <Hand cards={view.myHand} {myTurn} />

  {#if $status}<p class="status">{$status}</p>{/if}
</section>

<style>
  .turn { font-weight: bold; }
  .status { color: #b00; }
</style>
