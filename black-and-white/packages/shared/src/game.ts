import type {
  Card,
  ClientView,
  Color,
  GameReview,
  GameReviewRound,
  GameState,
  PlayerId,
  RoundRecord,
  RoundResult,
} from './types';

export const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'];

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
  const finished = g.current.index >= 9;
  const nextIndex = g.current.index + 1;

  return {
    hands,
    scores,
    history,
    // When finished, intentionally keep current.index at the last played
    // round (9) — there is no round 10, so it is never advanced.
    current: finished
      ? { index: g.current.index, leader: nextLeader }
      : { index: nextIndex, leader: nextLeader },
    phase: finished ? 'finished' : 'playing',
  };
}

export function toClientView(g: GameState, me: PlayerId): ClientView {
  const opp = otherPlayer(me);
  const leader = g.current.leader;

  const myPlayedFromHistory = g.history.map((r) => r.cards[me]);
  const oppColorsFromHistory: Color[] = g.history.map((r) => colorOf(r.cards[opp]));

  // 当前回合进行中的牌
  const leaderPlayed = g.current.leaderCard !== undefined;

  const myPlayed = [...myPlayedFromHistory];
  const oppColors = [...oppColorsFromHistory];

  // 当前回合：我若已出，补进 myPlayed；对手若已出，补颜色
  const iAmLeader = leader === me;
  if (iAmLeader && leaderPlayed) myPlayed.push(g.current.leaderCard!);
  if (!iAmLeader && leaderPlayed) oppColors.push(colorOf(g.current.leaderCard!));

  const roundResults: RoundResult[] = g.history.map((r) =>
    r.winner === 'draw' ? 'draw' : r.winner === me ? 'win' : 'lose',
  );

  const oppHand = g.hands[opp];
  const opponentRemaining = {
    black: oppHand.filter((c) => c % 2 === 0).length,
    white: oppHand.filter((c) => c % 2 !== 0).length,
  };

  return {
    myHand: [...g.hands[me]],
    myPlayedCards: myPlayed,
    opponentCardsLeft: g.hands[opp].length,
    opponentPlayedColors: oppColors,
    opponentRemaining,
    roundResults,
    scores: { me: g.scores[me], opp: g.scores[opp] },
    currentRound: {
      index: g.current.index,
      iAmLeader,
      leaderColor: leaderPlayed ? colorOf(g.current.leaderCard!) : undefined,
      leaderHasPlayed: leaderPlayed,
    },
    turn: currentTurn(g) === me ? 'me' : 'opp',
    phase: g.phase,
  };
}

export function toReview(g: GameState, me: PlayerId): GameReview {
  const opp = otherPlayer(me);
  const rounds: GameReviewRound[] = g.history.map((r) => ({
    round: r.round,
    firstPlayer: r.leader === me ? 'me' : 'opp',
    myCard: r.cards[me],
    oppCard: r.cards[opp],
    result: r.winner === 'draw' ? 'draw' : r.winner === me ? 'win' : 'lose',
  }));

  const myScore = g.scores[me];
  const oppScore = g.scores[opp];
  const winner = myScore > oppScore ? 'me' : oppScore > myScore ? 'opp' : 'draw';

  return { rounds, finalScore: { me: myScore, opp: oppScore }, winner };
}
