import { compareHandValues, evaluateSeven } from "./hand";
import type {
  ActionType,
  Card,
  ClientView,
  GameConfig,
  GameState,
  LegalActions,
  PlayerId,
  PlayerState,
  Rank,
  ShowdownResult,
  Street,
  Suit,
} from "./types";

export const PLAYER_IDS: readonly PlayerId[] = ["p1", "p2"];
export const DEFAULT_CONFIG: GameConfig = {
  startingChips: 300,
  smallBlind: 5,
  bigBlind: 10,
  enforceMinRaise: false,
};

const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: readonly Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export type PlayerAction =
  | { type: Exclude<ActionType, "bet" | "raise"> }
  | { type: "bet" | "raise"; amount: number };

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ id: `${rank}-${suit}`, rank, suit })),
  );
}

export function shuffleDeck(
  deck: readonly Card[],
  rng: () => number = Math.random,
): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === "p1" ? "p2" : "p1";
}

function commitChips(player: PlayerState, amount: number): PlayerState {
  const paid = Math.min(amount, player.chips);
  return {
    ...player,
    chips: player.chips - paid,
    committed: player.committed + paid,
    streetBet: player.streetBet + paid,
    allIn: player.chips - paid === 0,
  };
}

function dealCommunity(
  deck: Card[],
  count: number,
): { deck: Card[]; cards: Card[] } {
  return { cards: deck.slice(0, count), deck: deck.slice(count) };
}

export function createHand(
  dealer: PlayerId,
  inputDeck: readonly Card[],
  config: GameConfig = DEFAULT_CONFIG,
  handNumber = 1,
  stacks: Record<PlayerId, number> = {
    p1: config.startingChips,
    p2: config.startingChips,
  },
): GameState {
  if (inputDeck.length < 9)
    throw new Error("Deck does not contain enough cards");
  let deck = [...inputDeck];
  const players: Record<PlayerId, PlayerState> = {
    p1: {
      chips: stacks.p1,
      committed: 0,
      streetBet: 0,
      holeCards: [deck[0], deck[2]],
      folded: false,
      allIn: false,
    },
    p2: {
      chips: stacks.p2,
      committed: 0,
      streetBet: 0,
      holeCards: [deck[1], deck[3]],
      folded: false,
      allIn: false,
    },
  };
  deck = deck.slice(4);

  const smallBlind = dealer;
  const bigBlind = otherPlayer(dealer);
  players[smallBlind] = commitChips(players[smallBlind], config.smallBlind);
  players[bigBlind] = commitChips(players[bigBlind], config.bigBlind);
  const pot = players.p1.committed + players.p2.committed;
  const baseRaiseIncrement = config.enforceMinRaise ? config.bigBlind : 5;

  return {
    deck,
    startingChips: config.startingChips,
    dealer,
    street: "preflop",
    phase: "betting",
    players,
    communityCards: [],
    pot,
    currentBet: config.bigBlind,
    minRaise: baseRaiseIncrement,
    baseRaiseIncrement,
    enforceMinRaise: config.enforceMinRaise,
    actionOn: dealer,
    acted: [],
    lastAggressor: bigBlind,
    handNumber,
    winner: null,
    winReason: null,
    showdown: null,
  };
}

export function createNextHand(
  previous: GameState,
  inputDeck: readonly Card[],
  config: GameConfig = DEFAULT_CONFIG,
): GameState {
  if (previous.phase !== "finished") {
    throw new Error("Previous hand is not finished");
  }
  if (PLAYER_IDS.some((id) => previous.players[id].chips <= 0)) {
    throw new Error("Match is over");
  }
  return createHand(
    otherPlayer(previous.dealer),
    inputDeck,
    config,
    previous.handNumber + 1,
    {
      p1: previous.players.p1.chips,
      p2: previous.players.p2.chips,
    },
  );
}

function callAmount(game: GameState, player: PlayerId): number {
  return Math.max(0, game.currentBet - game.players[player].streetBet);
}

export function legalActionsFor(
  game: GameState,
  player: PlayerId,
): LegalActions {
  const active = game.phase === "betting" && game.actionOn === player;
  const me = game.players[player];
  const toCall = active ? callAmount(game, player) : 0;
  const maxTotal = active ? me.streetBet + me.chips : 0;
  const minRaiseTo =
    active && game.currentBet > 0
      ? Math.min(maxTotal, game.currentBet + game.minRaise)
      : null;
  const minBet =
    active && game.currentBet === 0
      ? Math.min(maxTotal, game.baseRaiseIncrement)
      : null;

  return {
    canFold: active && toCall > 0,
    canCheck: active && toCall === 0,
    canCall: active && toCall > 0,
    callAmount: toCall,
    minRaiseTo:
      active && game.currentBet > 0 && maxTotal > game.currentBet
        ? minRaiseTo
        : null,
    maxRaiseTo: active && game.currentBet > 0 ? maxTotal : null,
    canBet: active && game.currentBet === 0 && me.chips > 0,
    minBet,
    maxBet: active && game.currentBet === 0 ? maxTotal : null,
    canAllIn: active && me.chips > 0,
  };
}

function bothPlayersSettled(game: GameState): boolean {
  return PLAYER_IDS.every((id) => {
    const p = game.players[id];
    return (
      p.folded ||
      p.allIn ||
      (game.acted.includes(id) && p.streetBet === game.currentBet)
    );
  });
}

function nextStreet(street: Street): Street {
  if (street === "preflop") return "flop";
  if (street === "flop") return "turn";
  if (street === "turn") return "river";
  return "showdown";
}

function resetBettingForStreet(game: GameState, street: Street): GameState {
  const first = otherPlayer(game.dealer);
  const players = {
    p1: { ...game.players.p1, streetBet: 0 },
    p2: { ...game.players.p2, streetBet: 0 },
  };
  const active = players[first].allIn ? game.dealer : first;
  return {
    ...game,
    street,
    players,
    currentBet: 0,
    minRaise: game.baseRaiseIncrement,
    actionOn: active,
    acted: [],
    lastAggressor: null,
  };
}

function advanceStreet(game: GameState): GameState {
  if (PLAYER_IDS.some((id) => game.players[id].allIn)) {
    return finishShowdown(dealRemainingBoard(game));
  }

  const street = nextStreet(game.street);
  if (street === "showdown") return finishShowdown({ ...game, street });

  const flopCount = street === "flop" ? 3 : 1;
  const dealt = dealCommunity(game.deck, flopCount);
  return resetBettingForStreet(
    {
      ...game,
      deck: dealt.deck,
      communityCards: [...game.communityCards, ...dealt.cards],
    },
    street,
  );
}

function dealRemainingBoard(game: GameState): GameState {
  let next = { ...game };
  while (next.communityCards.length < 5) {
    const dealt = dealCommunity(
      next.deck,
      next.communityCards.length === 0 ? 3 : 1,
    );
    next = {
      ...next,
      deck: dealt.deck,
      communityCards: [...next.communityCards, ...dealt.cards],
    };
  }
  return { ...next, street: "showdown" };
}

function awardPot(game: GameState, winners: PlayerId[]): GameState {
  const share = Math.floor(game.pot / winners.length);
  const remainder = game.pot - share * winners.length;
  const players = {
    p1: { ...game.players.p1 },
    p2: { ...game.players.p2 },
  };
  winners.forEach((winner, index) => {
    players[winner].chips += share + (index === 0 ? remainder : 0);
  });
  return { ...game, players, pot: 0 };
}

function finishByFold(game: GameState, folder: PlayerId): GameState {
  const winner = otherPlayer(folder);
  return {
    ...awardPot(
      {
        ...game,
        phase: "finished",
        players: {
          ...game.players,
          [folder]: { ...game.players[folder], folded: true },
        },
      },
      [winner],
    ),
    winner,
    winReason: "fold",
  };
}

function finishShowdown(game: GameState): GameState {
  const hands = {
    p1: evaluateSeven([...game.players.p1.holeCards, ...game.communityCards]),
    p2: evaluateSeven([...game.players.p2.holeCards, ...game.communityCards]),
  };
  const cmp = compareHandValues(hands.p1, hands.p2);
  const winners: PlayerId[] =
    cmp > 0 ? ["p1"] : cmp < 0 ? ["p2"] : ["p1", "p2"];
  const showdown: ShowdownResult = { winners, hands };
  return {
    ...awardPot(
      { ...game, phase: "finished", street: "showdown", showdown },
      winners,
    ),
    winner: winners.length === 2 ? "split" : winners[0],
    winReason: "showdown",
    showdown,
  };
}

function markActed(game: GameState, player: PlayerId): GameState {
  return game.acted.includes(player)
    ? game
    : { ...game, acted: [...game.acted, player] };
}

export function applyAction(
  game: GameState,
  player: PlayerId,
  action: PlayerAction,
): GameState {
  if (game.phase !== "betting") throw new Error("Hand is not in betting");
  if (game.actionOn !== player) throw new Error("It is not your turn");
  const legal = legalActionsFor(game, player);
  const opp = otherPlayer(player);

  if (action.type === "fold") {
    if (!legal.canFold) throw new Error("Cannot fold");
    return finishByFold(game, player);
  }

  let next = game;
  if (action.type === "check") {
    if (!legal.canCheck) throw new Error("Cannot check");
    next = markActed(game, player);
  } else if (action.type === "call") {
    if (!legal.canCall) throw new Error("Cannot call");
    const amount = legal.callAmount;
    next = {
      ...game,
      players: {
        ...game.players,
        [player]: commitChips(game.players[player], amount),
      },
      pot: game.pot + Math.min(amount, game.players[player].chips),
    };
    next = markActed(next, player);
  } else if (action.type === "bet") {
    if (
      !legal.canBet ||
      legal.minBet === null ||
      action.amount < legal.minBet
    ) {
      throw new Error("Minimum bet not met");
    }
    if (legal.maxBet === null || action.amount > legal.maxBet) {
      throw new Error("Bet exceeds stack");
    }
    next = {
      ...game,
      players: {
        ...game.players,
        [player]: commitChips(game.players[player], action.amount),
      },
      pot: game.pot + action.amount,
      currentBet: action.amount,
      minRaise: game.enforceMinRaise ? action.amount : game.baseRaiseIncrement,
      acted: [player],
      lastAggressor: player,
    };
  } else if (action.type === "raise") {
    if (legal.minRaiseTo === null || action.amount < legal.minRaiseTo) {
      throw new Error("Minimum raise not met");
    }
    if (legal.maxRaiseTo === null || action.amount > legal.maxRaiseTo) {
      throw new Error("Raise exceeds stack");
    }
    const additional = action.amount - game.players[player].streetBet;
    next = {
      ...game,
      players: {
        ...game.players,
        [player]: commitChips(game.players[player], additional),
      },
      pot: game.pot + additional,
      minRaise: game.enforceMinRaise
        ? action.amount - game.currentBet
        : game.baseRaiseIncrement,
      currentBet: action.amount,
      acted: [player],
      lastAggressor: player,
    };
  } else if (action.type === "all-in") {
    const target = game.players[player].streetBet + game.players[player].chips;
    const additional = game.players[player].chips;
    next = {
      ...game,
      players: {
        ...game.players,
        [player]: commitChips(game.players[player], additional),
      },
      pot: game.pot + additional,
      currentBet: Math.max(game.currentBet, target),
      acted: [player],
      lastAggressor: target > game.currentBet ? player : game.lastAggressor,
    };
  }

  if (bothPlayersSettled(next)) return advanceStreet(next);
  return { ...next, actionOn: opp };
}

function stripHoleCards(player: PlayerState): Omit<PlayerState, "holeCards"> {
  const { holeCards: _holeCards, ...rest } = player;
  return rest;
}

export function toClientView(game: GameState, me: PlayerId): ClientView {
  const opp = otherPlayer(me);
  const showdownVisible =
    game.phase === "finished" && game.winReason === "showdown";
  const matchOver =
    game.phase === "finished" &&
    PLAYER_IDS.some((id) => game.players[id].chips <= 0);
  const matchWinnerId = matchOver
    ? PLAYER_IDS.find((id) => game.players[id].chips > 0) ?? null
    : null;
  const winner =
    game.winner === null || game.winner === "split"
      ? game.winner
      : game.winner === me
        ? "me"
        : "opp";

  return {
    myId: me,
    myHoleCards: [...game.players[me].holeCards],
    opponentHoleCount: game.players[opp].holeCards.length,
    opponentHoleCards: showdownVisible
      ? [...game.players[opp].holeCards]
      : null,
    communityCards: [...game.communityCards],
    pot: game.pot,
    street: game.street,
    phase: game.phase,
    dealer: game.dealer === me ? "me" : "opp",
    actionOn: game.actionOn === me ? "me" : "opp",
    players: {
      me: stripHoleCards(game.players[me]),
      opp: stripHoleCards(game.players[opp]),
    },
    legalActions: legalActionsFor(game, me),
    settings: {
      enforceMinRaise: game.enforceMinRaise,
      startingChips: game.startingChips,
    },
    winner,
    winReason: game.winReason,
    showdown: showdownVisible ? game.showdown : null,
    matchOver,
    matchWinner:
      matchWinnerId === null ? null : matchWinnerId === me ? "me" : "opp",
    canStartNextHand:
      game.phase === "finished" &&
      PLAYER_IDS.every((id) => game.players[id].chips > 0),
  };
}
