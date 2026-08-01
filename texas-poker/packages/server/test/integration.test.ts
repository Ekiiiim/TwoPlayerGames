import { afterEach, describe, expect, it } from "vitest";
import { io as ioc, type Socket } from "socket.io-client";
import { createDeck } from "@texas-poker/shared";
import type { Card, ClientView } from "@texas-poker/shared";
import { startServer } from "../src/index";

let stop: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (stop) await stop();
  stop = null;
});

function connect(port: number) {
  return ioc(`http://localhost:${port}`, { forceNew: true });
}

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) =>
    socket.once(event, resolve as (value: unknown) => void),
  );
}

function waitView(
  socket: Socket,
  pred: (view: ClientView) => boolean,
): Promise<ClientView> {
  return new Promise((resolve) => {
    const handler = (view: ClientView) => {
      if (pred(view)) {
        socket.off("view_update", handler);
        resolve(view);
      }
    };
    socket.on("view_update", handler);
  });
}

function actAndView(
  socket: Socket,
  action: Record<string, unknown>,
): Promise<ClientView> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Timed out waiting for ${String(action.type)} response`),
      );
    }, 700);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("view_update", onView);
      socket.off("error_msg", onError);
    };
    const onView = (view: ClientView) => {
      cleanup();
      resolve(view);
    };
    const onError = (error: { message: string }) => {
      cleanup();
      reject(new Error(error.message));
    };
    socket.once("view_update", onView);
    socket.once("error_msg", onError);
    socket.emit("poker_action", action);
  });
}

async function actAndViews(
  actor: Socket,
  other: Socket,
  action: Record<string, unknown>,
): Promise<[ClientView, ClientView]> {
  const actorView = once<ClientView>(actor, "view_update");
  const otherView = once<ClientView>(other, "view_update");
  actor.emit("poker_action", action);
  return Promise.all([actorView, otherView]);
}

function card(id: string): Card {
  const found = createDeck().find((c) => c.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function fixtureDeck(): Card[] {
  const ids = [
    "A-spades",
    "A-hearts",
    "K-spades",
    "Q-hearts",
    "2-clubs",
    "7-diamonds",
    "9-hearts",
    "J-clubs",
    "4-spades",
  ];
  const chosenIds = new Set(ids);
  return [
    ...ids.map(card),
    ...createDeck().filter((c) => !chosenIds.has(c.id)),
  ];
}

async function createJoin(port: number) {
  const a = connect(port);
  const b = connect(port);
  a.emit("create_room");
  const created = await once<{ roomCode: string; sessionToken: string }>(
    a,
    "room_created",
  );
  const pA = once<ClientView>(a, "view_update");
  const pB = once<ClientView>(b, "view_update");
  b.emit("join_room", { roomCode: created.roomCode });
  return { a, b, created, va: await pA, vb: await pB };
}

describe("texas-poker server", () => {
  it("starts a heads-up hand and lets a fold award the pot", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;
    const { a, b, va, vb } = await createJoin(port);

    expect(va.myHoleCards.map((c) => c.id)).toEqual(["A-spades", "K-spades"]);
    expect(vb.myHoleCards.map((c) => c.id)).toEqual(["A-hearts", "Q-hearts"]);
    expect(va.pot).toBe(15);
    expect(va.actionOn).toBe("me");

    const finalA = waitView(a, (v) => v.phase === "finished");
    const finalB = waitView(b, (v) => v.phase === "finished");
    a.emit("poker_action", { type: "fold" });
    expect((await finalA).winner).toBe("opp");
    expect((await finalB).winner).toBe("me");

    a.close();
    b.close();
  });

  it("rejects out-of-turn and invalid actions without trusting client player ids", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;
    const { a, b } = await createJoin(port);

    const outOfTurn = once<{ message: string }>(b, "error_msg");
    b.emit("poker_action", { type: "call", player: "p1" });
    expect((await outOfTurn).message).toContain("not your turn");

    const invalid = once<{ message: string }>(a, "error_msg");
    a.emit("poker_action", { type: "check" });
    expect((await invalid).message).toContain("Cannot check");

    a.close();
    b.close();
  });

  it("plays to showdown and reveals opponent hole cards only after showdown", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;
    const { a, b, va } = await createJoin(port);
    expect(va.opponentHoleCards).toBeNull();

    let latest: ClientView | null = null;
    await actAndViews(a, b, { type: "call" });
    await actAndViews(b, a, { type: "check" });
    await actAndViews(b, a, { type: "check" });
    await actAndViews(a, b, { type: "check" });
    await actAndViews(b, a, { type: "check" });
    await actAndViews(a, b, { type: "check" });
    await actAndViews(b, a, { type: "check" });
    [latest] = await actAndViews(a, b, { type: "check" });

    const final =
      latest?.phase === "finished"
        ? latest
        : await waitView(a, (v) => v.phase === "finished");
    expect(final.winReason).toBe("showdown");
    expect(final.opponentHoleCards?.map((c) => c.id)).toEqual([
      "A-hearts",
      "Q-hearts",
    ]);

    a.close();
    b.close();
  });

  it("does not leak opponent hole cards or deck order in active views", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;
    const { a, va } = await createJoin(port);
    const serialized = JSON.stringify(va);

    expect(serialized).not.toContain("A-hearts");
    expect(serialized).not.toContain("Q-hearts");
    expect(serialized).not.toContain("2-clubs");
    a.close();
  });

  it("restores a cropped view on rejoin", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;
    const { a, b, created } = await createJoin(port);

    a.close();
    const a2 = connect(port);
    a2.emit("rejoin", {
      roomCode: created.roomCode,
      sessionToken: created.sessionToken,
    });
    const restored = await once<ClientView>(a2, "view_update");
    expect(restored.myHoleCards.map((c) => c.id)).toEqual([
      "A-spades",
      "K-spades",
    ]);
    expect(JSON.stringify(restored)).not.toContain("A-hearts");

    a2.close();
    b.close();
  });

  it("starts the next hand after a finished hand", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;
    const { a, b } = await createJoin(port);

    a.emit("poker_action", { type: "fold" });
    await waitView(a, (v) => v.phase === "finished");

    const nextA = waitView(a, (v) => v.phase === "betting" && v.street === "preflop");
    const nextB = waitView(b, (v) => v.phase === "betting" && v.street === "preflop");
    b.emit("next_hand");
    const viewA = await nextA;
    const viewB = await nextB;

    expect(viewA.dealer).toBe("opp");
    expect(viewA.actionOn).toBe("opp");
    expect(viewA.pot).toBe(15);
    expect(viewB.dealer).toBe("me");
    a.close();
    b.close();
  });
});
