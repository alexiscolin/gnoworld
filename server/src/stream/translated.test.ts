import { Address, TranslationEvent } from "@gnoworld/schemas";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { makeStream, type Stream } from "./stream.ts";

// Translation events go on the verdicts' stream in its sequence and rings, to the streams that asked their language alone; the languages
// signed-in streams read in are what a world's lines are translated into.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const streams: Stream[] = [];
afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
});
const event = (msgid: string, language: "fr" | "de" = "fr", room = "#bubble"): TranslationEvent => ({
  room,
  msgid,
  language,
  status: "original",
});

const setup = (options: Parameters<typeof makeStream>[0] = {}) => {
  const stream = makeStream(options);
  streams.push(stream);
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => true),
    () => true,
  );
  app.route(
    "/api/stream",
    stream.routes({
      proxy: undefined,
      visible: () => true,
      session: (token) => (token === "alice" ? ALICE : token === "bob" ? BOB : undefined),
    }),
  );
  let peer = 0;
  const open = async (query: string, { who, last }: { who?: string; last?: string } = {}) => {
    peer += 1;
    const response = await app.request(
      `/api/stream?${query}`,
      {
        headers: {
          ...(last === undefined ? {} : { "last-event-id": last }),
          ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
        },
      },
      { incoming: { socket: { remoteAddress: `203.0.113.${String(peer)}` } } },
    );
    const reader = response.body?.getReader();
    let text = "";
    const frames = async (name: string, count: number) => {
      const all = () =>
        [...text.matchAll(/id: (\d+)\nevent: (\w+)\ndata: (.*)\n\n/g)]
          .filter(([, , found]) => found === name)
          .map(([, id = "", , data = ""]) => ({ id, data: JSON.parse(data) as unknown }));
      for (;;) {
        const found = all();
        const chunk: { done: boolean; value?: Uint8Array } | undefined =
          found.length >= count ? undefined : await reader?.read();
        if (chunk === undefined || chunk.done) return found;
        text += new TextDecoder().decode(chunk.value);
      }
    };
    return { response, frames, raw: () => text, cancel: () => reader?.cancel() };
  };
  return { stream, open };
};
const ids = (frames: { data: unknown }[]) => frames.map(({ data }) => (data as { msgid: string }).msgid);

describe("the stream's translation events", () => {
  it("sends one to the readers of its room that asked its language, named `translation`, and to no other", async () => {
    const { stream, open } = setup();
    const french = await open("rooms=%23bubble&language=fr");
    const german = await open("rooms=%23bubble&language=de");
    const none = await open("rooms=%23bubble");
    const elsewhere = await open("rooms=%23other&language=fr");
    stream.translation(event("m1", "fr"));
    stream.translation(event("m2", "de"));
    stream.translation(event("m3", "fr"));
    expect(ids(await french.frames("translation", 2))).toEqual(["m1", "m3"]);
    expect(ids(await german.frames("translation", 1))).toEqual(["m2"]);
    expect(TranslationEvent.parse((await french.frames("translation", 1))[0]?.data)).toEqual(event("m1", "fr"));
    expect(none.raw()).not.toContain("translation");
    expect(elsewhere.raw()).not.toContain("translation");
  });

  it("refuses a language off the list, or given twice, as it refuses a room it cannot read", async () => {
    const { open } = setup();
    expect((await open("rooms=%23bubble&language=xx")).response.status).toBe(400);
    expect((await open("rooms=%23bubble&language=fr&language=de")).response.status).toBe(400);
    expect((await open("rooms=%23bubble&language=fr")).response.status).toBe(200);
  });

  it("replays a client the room's translations in its language, after the Last-Event-ID, in the sequence of verdicts", async () => {
    const { stream, open } = setup();
    stream.translation(event("m1", "fr"));
    stream.translation(event("m2", "de"));
    stream.publish({ msgid: "m1", room: "#bubble", state: "checked" });
    stream.translation(event("m3", "fr"));
    const late = await open("rooms=%23bubble&language=fr");
    const frames = await late.frames("translation", 2);
    expect(ids(frames)).toEqual(["m1", "m3"]);
    const verdict = (await late.frames("verdict", 1))[0];
    expect(Number(frames[0]?.id)).toBeLessThan(Number(verdict?.id));
    expect(Number(verdict?.id)).toBeLessThan(Number(frames[1]?.id));
    const back = await open("rooms=%23bubble&language=fr", { last: frames[0]?.id ?? "" });
    expect(ids(await back.frames("translation", 1))).toEqual(["m3"]);
  });

  it("tells a translation gone to the readers of its language and purges the line from the ring, so a replay holds none of it", async () => {
    const { stream, open } = setup();
    const live = await open("rooms=%23bubble&language=fr");
    stream.translation(event("m1", "fr"));
    stream.translation(event("m2", "fr"));
    stream.translation({ room: "#bubble", msgid: "m1", language: "fr", status: "gone" });
    const told = await live.frames("translation", 3);
    expect(told.map(({ data }) => (data as { status: string }).status)).toEqual(["original", "original", "gone"]);
    const late = await open("rooms=%23bubble&language=fr");
    expect(ids(await late.frames("translation", 1))).toEqual(["m2"]);
    expect(late.raw()).not.toContain('"msgid":"m1"');
  });

  it("keeps them in a ring that stays bounded, and counts them in what it holds", async () => {
    const { stream, open } = setup({ pending: 4 });
    for (let n = 0; n < 10; n += 1) stream.translation(event(`m${String(n)}`));
    expect(stream.size().events).toBeLessThanOrEqual(4);
    const client = await open("rooms=%23bubble&language=fr");
    expect(ids(await client.frames("translation", 4))).toEqual(["m6", "m7", "m8", "m9"]);
  });

  it("never pushes a room's verdicts out of a replay: its translations take only the room the verdicts leave", async () => {
    const { stream, open } = setup({ pending: 4 });
    for (let n = 0; n < 3; n += 1) stream.publish({ msgid: `v${String(n)}`, room: "#bubble", state: "checked" });
    for (let n = 0; n < 4; n += 1) stream.translation(event(`m${String(n)}`));
    const client = await open("rooms=%23bubble&language=fr");
    expect(ids(await client.frames("verdict", 3))).toEqual(["v0", "v1", "v2"]);
    expect(ids(await client.frames("translation", 1))).toEqual(["m3"]);
  });

  it("drops a client that leaves them unread", async () => {
    const { stream, open } = setup({ pending: 2 });
    const client = await open("rooms=%23bubble&language=fr");
    for (let n = 0; n < 50; n += 1) stream.translation(event(`m${String(n)}`));
    await client.cancel();
    expect(stream.size().clients).toBeLessThanOrEqual(1);
  });
});

describe("the languages in use on a world", () => {
  it("are those of the signed-in streams that follow it, a guest's never, the most recent first", async () => {
    const clock = { now: 1_000_000 };
    const { stream, open } = setup({ now: () => clock.now });
    await open("rooms=%23bubble&language=de");
    expect(stream.languages("bubble")).toEqual([]);
    await open("rooms=%23bubble&language=fr", { who: "alice" });
    clock.now += 1000;
    await open("rooms=%23bubble%2Fclub&language=es", { who: "bob" });
    expect(stream.languages("bubble")).toEqual(["es", "fr"]);
    expect(stream.languages("elsewhere")).toEqual([]);
  });

  it("leave a world 15 minutes after the last stream that read them", async () => {
    const clock = { now: 1_000_000 };
    const { stream, open } = setup({ now: () => clock.now });
    const alice = await open("rooms=%23bubble&language=fr", { who: "alice" });
    await alice.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    clock.now += 14 * 60_000;
    expect(stream.languages("bubble")).toEqual(["fr"]);
    clock.now += 2 * 60_000;
    expect(stream.languages("bubble")).toEqual([]);
  });

  it("count one account's languages as one reader: its streams in four languages never push out another reader's", async () => {
    const clock = { now: 1_000_000 };
    const { stream, open } = setup({ now: () => clock.now });
    await open("rooms=%23bubble&language=pt", { who: "bob" });
    clock.now += 1000;
    for (const language of ["fr", "de", "es", "it"])
      await open(`rooms=%23bubble&language=${language}`, { who: "alice" });
    expect(stream.languages("bubble")[0]).toBe("pt");
  });

  it("leave out the asker's own streams when asked for another's readers", async () => {
    const { stream, open } = setup();
    await open("rooms=%23bubble&language=de", { who: "alice" });
    expect(stream.languages("bubble", ALICE)).toEqual([]);
    expect(stream.languages("bubble", BOB)).toEqual(["de"]);
  });

  it("are none for a stream with no language, and a signed-in stream's own language is counted once", async () => {
    const { stream, open } = setup();
    await open("rooms=%23bubble", { who: "alice" });
    await open("rooms=%23bubble&language=fr", { who: "alice" });
    await open("rooms=%23bubble&language=fr", { who: "bob" });
    expect(stream.languages("bubble")).toEqual(["fr"]);
  });
});
