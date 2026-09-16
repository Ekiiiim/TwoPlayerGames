import { afterEach, describe, expect, it } from "vitest";
import { io as ioc, type Socket } from "socket.io-client";
import { createDeck } from "@add-to-fifty/shared";
import type { Card, ClientView } from "@add-to-fifty/shared";
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

function card(id: string): Card {
  const found = createDeck().find((c) => c.id === id);
  if (!found) throw new Error(`Missing fixture card ${id}`);
  return found;
}

function fixtureDeck(): Card[] {
  const ids = [
    "10-spades",
    "10-hearts",
    "10-diamonds",
    "10-clubs",
    "K-spades",
    "9-spades",
    "9-hearts",
    "9-diamonds",
    "9-clubs",
    "8-spades",
    "A-spades",
    "2-spades",
    "3-spades",
    "4-spades",
    "5-spades",
  ];
  const chosen = ids.map(card);
  const chosenIds = new Set(ids);
  return [...chosen, ...createDeck().filter((c) => !chosenIds.has(c.id))];
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
  const va = await pA;
  const vb = await pB;
  return { a, b, created, va, vb };
}

describe("add-to-fifty server", () => {
  it("plays a full game, draws after each play, and declares the player who reaches fifty the loser", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;
    const { a, b, va, vb } = await createJoin(port);

    expect(va.myHand.map((c) => c.id)).toEqual([
      "10-spades",
      "10-hearts",
      "10-diamonds",
      "10-clubs",
      "K-spades",
    ]);
    expect(vb.myHand.map((c) => c.id)).toEqual([
      "9-spades",
      "9-hearts",
      "9-diamonds",
      "9-clubs",
      "8-spades",
    ]);

    a.emit("play_card", { cardId: "10-spades" });
    await waitView(a, (v) => v.discardTotal === 10 && v.turn === "opp");
    b.emit("play_card", { cardId: "9-spades" });
    await waitView(a, (v) => v.discardTotal === 19 && v.turn === "me");
    a.emit("play_card", { cardId: "10-hearts" });
    await waitView(a, (v) => v.discardTotal === 29 && v.turn === "opp");
    b.emit("play_card", { cardId: "9-hearts" });
    await waitView(a, (v) => v.discardTotal === 38 && v.turn === "me");
    a.emit("play_card", { cardId: "K-spades", kingDelta: 10 });
    await waitView(a, (v) => v.discardTotal === 48 && v.turn === "opp");

    const aFinished = waitView(a, (v) => v.phase === "finished");
    const bFinished = waitView(b, (v) => v.phase === "finished");
    b.emit("play_card", { cardId: "8-spades" });
    const finalA = await aFinished;
    const finalB = await bFinished;

    expect(finalA.discardTotal).toBe(56);
    expect(finalA.winner).toBe("me");
    expect(finalA.loser).toBe("opp");
    expect(finalB.winner).toBe("opp");
    expect(finalB.loser).toBe("me");
    expect(finalA.myHand).toHaveLength(5);

    a.close();
    b.close();
  });

  it("rejects out-of-turn, forged-card, and invalid K choices", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;
    const { a, b } = await createJoin(port);

    // The wire carries one code for every rules-engine rejection; which rule
    // fired is pinned down by the engine's own unit tests, where the
    // developer-facing English never reaches a player.
    const outOfTurn = once<{ code: string }>(b, "error_msg");
    b.emit("play_card", { cardId: "9-spades" });
    expect((await outOfTurn).code).toBe("INVALID_MOVE");

    const forged = once<{ code: string }>(a, "error_msg");
    a.emit("play_card", { cardId: "9-spades" });
    expect((await forged).code).toBe("INVALID_MOVE");

    const invalidK = once<{ code: string }>(a, "error_msg");
    a.emit("play_card", { cardId: "K-spades", kingDelta: 11 });
    expect((await invalidK).code).toBe("INVALID_MOVE");

    a.close();
    b.close();
  });

  it("does not leak opponent hand or deck order in any view_update", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;
    const { a, b } = await createJoin(port);
    const seenByA: ClientView[] = [];
    const seenByB: ClientView[] = [];
    a.on("view_update", (v: ClientView) => seenByA.push(v));
    b.on("view_update", (v: ClientView) => seenByB.push(v));

    a.emit("play_card", { cardId: "10-spades" });
    await waitView(a, (v) => v.discardTotal === 10);

    const aJson = JSON.stringify(seenByA);
    const bJson = JSON.stringify(seenByB);
    expect(aJson).not.toContain("9-hearts");
    expect(aJson).not.toContain("2-spades");
    expect(bJson).not.toContain("10-hearts");
    expect(bJson).not.toContain("2-spades");

    a.close();
    b.close();
  });

  it("restores a player's cropped view after rejoin", async () => {
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

    expect(restored.myHand.map((c) => c.id)).toContain("10-spades");
    expect(JSON.stringify(restored)).not.toContain("9-spades");

    a2.close();
    b.close();
  });

  it("sweeps rooms that have been empty beyond the TTL", async () => {
    const { port, close } = await startServer(0, {
      deck: fixtureDeck(),
      roomTtlMs: 5,
      sweepIntervalMs: 5,
    });
    stop = close;
    const a = connect(port);
    a.emit("create_room");
    const created = await once<{ roomCode: string; sessionToken: string }>(
      a,
      "room_created",
    );
    a.close();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const b = connect(port);
    b.emit("join_room", { roomCode: created.roomCode });
    const err = await once<{ code: string }>(b, "error_msg");
    expect(err.code).toBe("ROOM_NOT_FOUND");
    b.close();
  });

  // Display language belongs to the client. The server names what went wrong
  // with a stable code and never ships localized text, so a player's language
  // choice can't be contradicted by whatever the server happened to send.
  it("error_msg carries only a machine-readable code, never display text", async () => {
    const { port, close } = await startServer(0, { deck: fixtureDeck() });
    stop = close;

    const expectBareCode = (err: Record<string, unknown>) => {
      expect(Object.keys(err)).toEqual(["code"]);
      expect(err.code).toMatch(/^[A-Z_]+$/);
      expect(JSON.stringify(err)).not.toMatch(/[\u4e00-\u9fff]/);
    };

    const lone = connect(port);
    await once<void>(lone, "connect");
    for (const [event, payload] of [
      ["join_room", { roomCode: "ZZZZZZ" }],
      ["join_room", { nope: true }],
      ["rejoin", undefined],
    ] as [string, unknown][]) {
      const pErr = once<Record<string, unknown>>(lone, "error_msg");
      lone.emit(event, payload);
      expectBareCode(await pErr);
    }
    lone.close();

    // The rules engine throws Error objects with developer-facing English text.
    // This is the path where that text could leak to a player, so assert the
    // handler replaces it with a code rather than forwarding error.message.
    const { a, b } = await createJoin(port);
    const pErr = once<Record<string, unknown>>(b, "error_msg");
    b.emit("play_card", { cardId: "9-spades" });
    const err = await pErr;
    expectBareCode(err);
    expect(err.code).toBe("INVALID_MOVE");
    expect(JSON.stringify(err)).not.toMatch(/not your turn/i);

    a.close();
    b.close();
  });
});
