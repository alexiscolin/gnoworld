import { Address, Signal } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { logger } from "@gnoworld/service/log";
import { makeStream, type Stream } from "./stream.ts";

// Slice 9h: the first signals reach a page on the server's existing stream as their own event, `signal`, to the
// readers who follow the world's rooms and may read them; kept in the ring, so a page that opens just after still
// hears it. The verdicts' frames are unchanged.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const CHART: Signal = { kind: "chart", world: "fresh-mint", account: ALICE, at: "2026-11-05T12:00:00.000Z" };
const WORDS: Signal = { ...CHART, kind: "words" };

const streams: Stream[] = [];
afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
});

const setup = (visible: (room: string) => boolean = () => true) => {
  const stream = makeStream();
  streams.push(stream);
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => true),
    () => true,
  );
  app.route("/api/stream", stream.routes({ proxy: undefined, visible }));
  const open = async (rooms: string, lastEventId?: string) => {
    const response = await app.request(
      `/api/stream?rooms=${encodeURIComponent(rooms)}`,
      { headers: lastEventId === undefined ? {} : { "last-event-id": lastEventId } },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    let text = "";
    // Read until the stream's own `since` word: it comes after any replay, so what is before it is all there is.
    const settled = async (): Promise<string> => {
      while (!text.includes("event: since")) {
        const chunk = await reader?.read();
        if (chunk === undefined || chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
      }
      return text;
    };
    const next = async (): Promise<string> => {
      const chunk = await reader?.read();
      if (chunk !== undefined && !chunk.done) text += new TextDecoder().decode(chunk.value);
      return text;
    };
    const drain = async (): Promise<string> => {
      for (;;) {
        try {
          const chunk = await reader?.read();
          if (chunk === undefined || chunk.done) return text;
          text += new TextDecoder().decode(chunk.value);
        } catch {
          return text;
        }
      }
    };
    return { settled, next, drain, cancel: () => reader?.cancel() };
  };
  return { stream, open };
};
const signals = (text: string) =>
  [...text.matchAll(/event: signal\ndata: (.*)\n\n/g)].map(([, data = ""]) => Signal.parse(JSON.parse(data)));

describe("the stream's signal event", () => {
  it("tells a reader who follows the world's main room, as an event of its own with an id", async () => {
    const { stream, open } = setup();
    const client = await open("#fresh-mint");
    await client.settled();
    stream.signal(CHART);
    const text = await client.next();
    expect(text).toMatch(/id: \d+\nevent: signal\ndata: /);
    expect(signals(text)).toEqual([CHART]);
    expect(text).not.toContain("event: verdict");
    await client.cancel();
  });

  it("tells a reader who follows another room of the same world, and no reader of another world", async () => {
    const { stream, open } = setup();
    const same = await open("#fresh-mint/games");
    const other = await open("#bubble");
    await Promise.all([same.settled(), other.settled()]);
    stream.signal(WORDS);
    expect(signals(await same.next())).toEqual([WORDS]);
    // Another world's follower hears the next verdict of its own, and not the signal.
    stream.publish({ msgid: "m1", room: "#bubble", state: "checked" });
    const text = await other.next();
    expect(text).toContain("event: verdict");
    expect(signals(text)).toEqual([]);
    await Promise.all([same.cancel(), other.cancel()]);
  });

  it("tells nothing to a reader who may not read the world's rooms", async () => {
    const { stream, open } = setup((room) => !room.startsWith("#fresh-mint"));
    const client = await open("#fresh-mint");
    await client.settled();
    stream.signal(CHART);
    stream.publish({ msgid: "m1", room: "#fresh-mint", state: "checked" });
    // The stream ends, so what it holds is all it ever sent.
    stream.close();
    const text = await client.drain();
    expect(signals(text)).toEqual([]);
    expect(text).not.toContain("event: verdict");
  });

  it("replays it to a reader who comes after, before its `since`", async () => {
    const { stream, open } = setup();
    stream.signal(CHART);
    const late = await open("#fresh-mint");
    expect(signals(await late.settled())).toEqual([CHART]);
    await late.cancel();
  });

  // How a signal finds its readers is the world's, by the room's world: a slug that is another's prefix is another world.
  it("tells no reader of a world whose slug only starts like this one's", async () => {
    const { stream, open } = setup();
    const near = await open("#fresh-mint-2");
    await near.settled();
    stream.signal(CHART);
    stream.close();
    expect(signals(await near.drain())).toEqual([]);
  });

  it("tells a reader of two rooms of the world once, not once a room", async () => {
    const { stream, open } = setup();
    const both = await open("#fresh-mint,#fresh-mint/games");
    await both.settled();
    stream.signal(CHART);
    stream.close();
    expect(signals(await both.drain())).toEqual([CHART]);
  });

  it("replays it to a late reader of another room of the world, once", async () => {
    const { stream, open } = setup();
    stream.signal(CHART);
    const late = await open("#fresh-mint/games,#fresh-mint");
    expect(signals(await late.settled())).toEqual([CHART]);
    await late.cancel();
  });

  it("keeps ids in the stream's one sequence: a reader coming back after a signal gets what came after it, in order, and not the signal again", async () => {
    const { stream, open } = setup();
    const first = await open("#fresh-mint");
    await first.settled();
    stream.signal(CHART);
    const id = /id: (\d+)\nevent: signal/.exec(await first.next())?.[1];
    expect(id).toBeDefined();
    await first.cancel();
    stream.publish({ msgid: "m1", room: "#fresh-mint", state: "checked" });
    stream.publish({ msgid: "m2", room: "#fresh-mint", state: "hidden" });
    const back = await open("#fresh-mint", id);
    const text = await back.settled();
    expect(signals(text)).toEqual([]);
    expect([...text.matchAll(/"msgid":"(m\d)"/g)].map(([, msgid]) => msgid)).toEqual(["m1", "m2"]);
    // A later signal's id is above a verdict's before it.
    stream.signal(WORDS);
    expect(signals(await back.next())).toEqual([WORDS]);
    await back.cancel();
  });
});
