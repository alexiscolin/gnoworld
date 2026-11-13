import { parseLine, type IrcMessage } from "@gnoworld/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Address, RoomId } from "@gnoworld/schemas";
import { createAppStore } from "../../store/index.ts";
import { forwardPlaces } from "./unreadPlaces.ts";

// What the page forwards to the server of its reading places: only the ones Ergo echoed (the store's `read`), batched, never twice.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const EVERY = 5_000;
const stamp = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const echo = (room: string, time: string): IrcMessage => {
  const parsed = parseLine(`:ergo MARKREAD ${room} timestamp=${time}`);
  if (!parsed.ok) throw new Error("the line does not parse");
  return parsed.message;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const store = createAppStore();
  store.getState().loginActions.signedIn(ALICE);
  store.getState().chatActions.follow(["#bubble", "#garden"]);
  const sent: { room: string; time: string }[][] = [];
  const send = vi.fn((places: { room: string; time: string }[]) => {
    sent.push(places);
    return Promise.resolve(true);
  });
  const stop = forwardPlaces(store, send, { everyMs: EVERY });
  const heard = (room: string, time: string) => {
    store.getState().chatActions.heard(echo(room, time));
  };
  return { store, sent, send, stop, heard };
}

describe("the places forwarded to the server", () => {
  it("sends nothing while Ergo has echoed no place", async () => {
    const t = setup();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.send).not.toHaveBeenCalled();
  });

  it("sends a place Ergo echoed, at once when none went in the last 5 seconds", async () => {
    const t = setup();
    const time = stamp(-60_000);
    t.heard("#bubble", time);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent).toEqual([[{ room: "#bubble", time }]]);
  });

  it("sends the places the store already holds when it starts", async () => {
    const store = createAppStore();
    store.getState().loginActions.signedIn(ALICE);
    store.getState().chatActions.follow(["#bubble"]);
    const time = stamp(-60_000);
    store.getState().chatActions.heard(echo("#bubble", time));
    const send = vi.fn(() => Promise.resolve(true));
    forwardPlaces(store, send, { everyMs: EVERY });
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith([{ room: "#bubble", time }]);
  });

  it("batches the places of 5 seconds into one call, each room once with its latest time", async () => {
    const t = setup();
    t.heard("#bubble", stamp(-120_000));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent).toHaveLength(1);
    const [first, second, third] = [stamp(-90_000), stamp(-80_000), stamp(-70_000)];
    t.heard("#bubble", first);
    t.heard("#garden", second);
    t.heard("#bubble", third);
    await vi.advanceTimersByTimeAsync(EVERY - 1);
    expect(t.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1]?.toSorted((a, b) => a.room.localeCompare(b.room))).toEqual([
      { room: "#bubble", time: third },
      { room: "#garden", time: second },
    ]);
  });

  it("never sends a place twice", async () => {
    const t = setup();
    const time = stamp(-60_000);
    t.heard("#bubble", time);
    await vi.advanceTimersByTimeAsync(0);
    t.heard("#bubble", time);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("sends no place Ergo did not echo: a place only asked for never reaches the store's read", async () => {
    const t = setup();
    // a MARKREAD in a history batch, a person's and one past the clock are no echo: the store holds none of them
    const replay = parseLine(`@batch=x :ergo MARKREAD #bubble timestamp=${stamp(-1_000)}`);
    if (replay.ok) t.store.getState().chatActions.heard(replay.message);
    const person = parseLine(`:bob!u@h MARKREAD #bubble timestamp=${stamp(-1_000)}`);
    if (person.ok) t.store.getState().chatActions.heard(person.message);
    t.heard("#bubble", stamp(10 * 60_000));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.send).not.toHaveBeenCalled();
  });

  it("sends none of a direct message's place: only a room's", async () => {
    const t = setup();
    t.store.getState().chatActions.follow(["#bubble", "g1someoneelse"]);
    t.heard("g1someoneelse", stamp(-1_000));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.send).not.toHaveBeenCalled();
  });

  it("stops: nothing goes after stop, and a pending batch is dropped", async () => {
    const t = setup();
    t.heard("#bubble", stamp(-120_000));
    await vi.advanceTimersByTimeAsync(0);
    t.heard("#garden", stamp(-100_000));
    t.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("sends a place again after a call that failed, on the next place heard", async () => {
    const t = setup();
    t.send.mockImplementationOnce(() => Promise.resolve(false));
    const time = stamp(-120_000);
    t.heard("#bubble", time);
    await vi.advanceTimersByTimeAsync(0);
    t.heard("#garden", stamp(-100_000));
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.send.mock.calls[1]?.[0].map(({ room }) => room).toSorted()).toEqual(["#bubble", "#garden"]);
  });

  it("reads the rooms again only when they change: a change of another slice of the store parses no room", async () => {
    const t = setup();
    t.heard("#bubble", stamp(-60_000));
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(t.send).toHaveBeenCalledOnce();
    const parsed = vi.spyOn(RoomId, "safeParse");
    for (let n = 0; n < 10; n += 1) t.store.getState().loginActions.chat(n % 2 === 0 ? "connecting" : "off");
    expect(parsed).not.toHaveBeenCalled();
    parsed.mockRestore();
  });
});
