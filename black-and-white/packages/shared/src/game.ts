import type { Card, Color, GameState, PlayerId, RoundRecord } from './types';

export function colorOf(card: Card): Color {
  return card % 2 === 0 ? 'black' : 'white';
}

function fullHand(): Card[] {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8];
}

export function createGame(firstLeader: PlayerId): GameState {
  return {
    hands: { p1: fullHand(), p2: fullHand() },
    scores: { p1: 0, p2: 0 },
    current: { index: 1, leader: firstLeader },
    history: [],
    phase: 'playing',
  };
}

export function otherPlayer(p: PlayerId): PlayerId {
  return p === 'p1' ? 'p2' : 'p1';
}

export function currentTurn(g: GameState): PlayerId {
  return g.current.leaderCard === undefined
    ? g.current.leader
    : otherPlayer(g.current.leader);
}

export function playCard(g: GameState, player: PlayerId, card: Card): GameState {
  if (g.phase !== 'playing') {
    throw new Error('Game is not in progress');
  }
  if (currentTurn(g) !== player) {
    throw new Error('It is not your turn');
  }
  if (!g.hands[player].includes(card)) {
    throw new Error('Card is not in hand');
  }

  const leader = g.current.leader;
  const follower = otherPlayer(leader);

  // 取出手牌副本
  const hand = [...g.hands[player]];
  const idx = hand.indexOf(card);
  hand.splice(idx, 1);
  const hands = { ...g.hands, [player]: hand };

  if (player === leader) {
    return { ...g, hands, current: { ...g.current, leaderCard: card } };
  }

  // follower 出牌 → 结算
  const leaderCard = g.current.leaderCard!;
  const followerCard = card;
  const cards = { [leader]: leaderCard, [follower]: followerCard } as Record<PlayerId, Card>;

  let winner: PlayerId | 'draw';
  if (leaderCard > followerCard) winner = leader;
  else if (followerCard > leaderCard) winner = follower;
  else winner = 'draw';

  const scores = { ...g.scores };
  if (winner !== 'draw') scores[winner] += 1;

  const record: RoundRecord = { round: g.current.index, leader, cards, winner };
  const history = [...g.history, record];

  // 下回合 leader：赢家先出；平局维持原 leader
  const nextLeader = winner === 'draw' ? leader : winner;
  const nextIndex = g.current.index + 1;

  return {
    hands,
    scores,
    history,
    current: { index: nextIndex, leader: nextLeader },
    phase: g.phase,
  };
}
