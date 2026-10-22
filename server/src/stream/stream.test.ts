import { StreamEvent } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeApp } from "../app.ts";
import { logger } from "../log.ts";
import { makeStream, type Stream } from "./stream.ts";

const PEER = "203.0.113.7";
const PROXY = "10.0.0.2";
const streams: Stream[] = [];
afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
  vi.useRealTimers();
});

const event = (n: number, room = "#bubble") => ({ msgid: `m${String(n)}`, room, state: "checked" as const });

const setup = (options: Parameters<typeof makeStream>[0] = {}, proxy?: string) => {
  const stream = makeStream(options);
  streams.push(stream);
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => true),
    () => true,
  );
  app.route("/api/stream", stream.routes({ proxy }));
  const open = async (
    query: string,
    { peer = PEER, last, realIp }: { peer?: string; last?: string; realIp?: string } = {},
  ) => {
    const headers: Record<string, string> = {
      ...(last === undefined ? {} : { "last-event-id": last }),
      ...(realIp === undefined ? {} : { "x-real-ip": realIp }),
    };
    const response = await app.request(
      `/api/stream?${query}`,
      { headers },
      { incoming: { socket: { remoteAddress: peer } } },
    );
    // Taken at the first read, so a refusal's body stays readable.
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let text = "";
    let ended = false;
    const more = async (): Promise<boolean> => {
      reader ??= response.body?.getReader();
      const chunk = await reader?.read();
      if (chunk === undefined || chunk.done) {
        ended = true;
        return false;
      }
      text += new TextDecoder().decode(chunk.value);
      return true;
    };
    // The events read so far, as id and data, reading on until there are `count` or the stream ends.
    const read = async (count: number): Promise<{ id: string; data: unknown }[]> => {
      for (;;) {
        const events = [...text.matchAll(/id: (\d+)\nevent: verdict\ndata: (.*)\n\n/g)].map(
          ([, id = "", data = ""]) => ({
            id,
            data: JSON.parse(data) as unknown,
          }),
        );
        if (events.length >= count || ended || !(await more())) return events;
      }
    };
    return { response, read, raw: () => text, more, cancel: () => (reader ??= response.body?.getReader())?.cancel() };
  };
  const rooms = (list: string, more: Parameters<typeof open>[1] = {}) =>
    open(`rooms=${encodeURIComponent(list)}`, more);
  return { stream, open, rooms };
};
const msgids = (events: { data: unknown }[]) => events.map(({ data }) => (data as { msgid: string }).msgid);
const refusal = async (response: Response) => [response.status, await response.text()];

describe("the verdicts' stream", () => {
  it("sends each verdict of the rooms asked, checked or hidden, and never another room's", async () => {
    const { stream, rooms } = setup();
    const client = await rooms("#bubble,#earth");
    expect(client.response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(client.response.headers.get("cache-control")).toBe("no-cache");
    stream.publish({ msgid: "m1", room: "#bubble", state: "checked" });
    stream.publish({ msgid: "m2", room: "#elsewhere", state: "checked" });
    stream.publish({ msgid: "m3", room: "#earth", state: "hidden" });
    expect((await client.read(2)).map(({ data }) => data)).toEqual([
      { msgid: "m1", room: "#bubble", state: "checked" },
      { msgid: "m3", room: "#earth", state: "hidden" },
    ]);
  });

  it("gives a late client each room's last events, then what it missed after its Last-Event-ID", async () => {
    const { stream, rooms } = setup({ pending: 3 });
    for (let n = 1; n <= 5; n += 1) stream.publish(event(n));
    stream.publish(event(6, "#earth"));
    const late = await rooms("#bubble");
    const kept = await late.read(3);
    expect(msgids(kept)).toEqual(["m3", "m4", "m5"]);
    const again = await rooms("#bubble", { last: kept[0]?.id ?? "" });
    expect(msgids(await again.read(2))).toEqual(["m4", "m5"]);
  });

  it("numbers its events past any a server before a restart gave, so a client coming back gets the ring", async () => {
    const { stream, rooms } = setup();
    stream.publish(event(1));
    const first = await rooms("#bubble");
    const [only] = await first.read(1);
    expect(Number(only?.id)).toBeGreaterThanOrEqual(Date.parse("2026-01-01"));
    const back = await rooms("#bubble", { last: "999999" });
    expect(msgids(await back.read(1))).toEqual(["m1"]);
  });

  it("replays to a client far behind only the newest it may leave unread, and keeps it", async () => {
    const { stream, rooms } = setup({ pending: 4 });
    for (let n = 1; n <= 10; n += 1) stream.publish(event(n));
    const late = await rooms("#bubble");
    expect(msgids(await late.read(4))).toEqual(["m7", "m8", "m9", "m10"]);
    stream.publish(event(11));
    expect(msgids(await late.read(5))).toEqual(["m7", "m8", "m9", "m10", "m11"]);
  });

  it("keeps each room's last 64 events by default, and replays at most 64", async () => {
    const { stream, rooms } = setup();
    for (let n = 1; n <= 70; n += 1) stream.publish(event(n));
    const late = await rooms("#bubble");
    expect(msgids(await late.read(64))).toEqual(Array.from({ length: 64 }, (_, n) => `m${String(n + 7)}`));
  });

  it("refuses a Last-Event-ID it never gave", async () => {
    const { rooms } = setup();
    for (const last of ["abc", "-1", "1e9", "", "1".repeat(16)]) {
      expect(await refusal((await rooms("#bubble", { last })).response)).toEqual([400, '{"error":"refused"}']);
    }
  });

  it.each([
    ["26 rooms", `rooms=${Array.from({ length: 26 }, (_, n) => `%23r${String(n)}`).join(",")}`],
    ["a name that is no room", "rooms=bubble"],
    ["a name with a space", "rooms=%23a%20b"],
    ["a name with CR", "rooms=%23a%0Db"],
    ["a name with NUL", "rooms=%23a%00b"],
    ["a name of 65 characters", `rooms=%23${"a".repeat(64)}`],
    ["an empty list", "rooms="],
    ["no list", ""],
    ["two lists", "rooms=%23a&rooms=%23b"],
    ["a trailing comma", "rooms=%23a,"],
  ])("refuses %s with 400", async (_, query) => {
    const { open } = setup();
    expect(await refusal((await open(query)).response)).toEqual([400, '{"error":"refused"}']);
  });

  it("takes 25 rooms, a name of 64 characters, and one named twice", async () => {
    const { rooms } = setup();
    const many = Array.from({ length: 25 }, (_, n) => `#r${String(n)}`).join(",");
    for (const list of [many, `#${"a".repeat(63)}`, "#a,#a"]) expect((await rooms(list)).response.status).toBe(200);
  });

  it("holds 4 streams per visitor and a total, refusing more with 429", async () => {
    const { rooms } = setup({ total: 6 });
    for (let n = 0; n < 4; n += 1) expect((await rooms("#bubble")).response.status).toBe(200);
    expect(await refusal((await rooms("#bubble")).response)).toEqual([429, '{"error":"too_many"}']);
    expect((await rooms("#bubble", { peer: "198.51.100.1" })).response.status).toBe(200);
    expect((await rooms("#bubble", { peer: "198.51.100.1" })).response.status).toBe(200);
    expect((await rooms("#bubble", { peer: "198.51.100.2" })).response.status).toBe(429);
  });

  it("holds 1,000 streams in all by default", async () => {
    const { rooms } = setup();
    for (let n = 0; n < 1000; n += 1) {
      expect((await rooms("#bubble", { peer: `198.51.100.${String(Math.floor(n / 4))}` })).response.status).toBe(200);
    }
    expect((await rooms("#bubble", { peer: "192.0.2.1" })).response.status).toBe(429);
  });

  it("counts a visitor by the proxy's X-Real-IP only from the proxy, and an IPv6 visitor by its /64", async () => {
    const forged = setup();
    for (let n = 0; n < 4; n += 1) await forged.rooms("#bubble", { realIp: `192.0.2.${String(n)}` });
    expect((await forged.rooms("#bubble", { realIp: "192.0.2.9" })).response.status).toBe(429);
    const proxied = setup({}, PROXY);
    for (const realIp of ["192.0.2.1", "192.0.2.2"]) {
      for (let n = 0; n < 4; n += 1) {
        expect((await proxied.rooms("#bubble", { peer: PROXY, realIp })).response.status).toBe(200);
      }
    }
    expect((await proxied.rooms("#bubble", { peer: PROXY, realIp: "192.0.2.1" })).response.status).toBe(429);
    const six = setup();
    for (let n = 0; n < 4; n += 1) await six.rooms("#bubble", { peer: `2001:db8:1:2::${String(n + 1)}` });
    expect((await six.rooms("#bubble", { peer: "2001:db8:1:2:ffff::1" })).response.status).toBe(429);
    expect((await six.rooms("#bubble", { peer: "2001:db8:1:3::1" })).response.status).toBe(200);
  });

  it("beats every 15 seconds by default, so a proxy keeps a quiet stream open", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { stream, rooms } = setup();
    const client = await rooms("#bubble");
    vi.advanceTimersByTime(14_999);
    stream.publish(event(1));
    await client.read(1);
    expect(client.raw()).not.toContain(": beat");
    vi.advanceTimersByTime(1);
    while (!client.raw().includes(": beat\n\n")) expect(await client.more()).toBe(true);
  });

  it("drops a client that reads too slowly and frees its place, while one that reads gets every event", async () => {
    const { stream, rooms } = setup({ pending: 8 });
    const fast = await rooms("#bubble", { peer: "198.51.100.1" });
    const slow = await rooms("#bubble");
    for (let n = 1; n <= 20; n += 1) {
      stream.publish(event(n));
      expect(await fast.read(n)).toHaveLength(n);
    }
    expect((await slow.read(20)).length).toBeLessThanOrEqual(8);
    for (let n = 0; n < 4; n += 1) {
      await expect.poll(async () => (await rooms("#bubble")).response.status).toBe(200);
    }
  });

  it("ends every stream when it closes, for the server's drain", async () => {
    const { stream, rooms } = setup();
    const client = await rooms("#bubble");
    stream.close();
    expect(await client.read(1)).toEqual([]);
  });
});

describe("the verdicts' stream, its green pass (3j)", () => {
  it("frees its place in the total when a stream ends", async () => {
    const { rooms } = setup({ total: 2 });
    const first = await rooms("#bubble", { peer: "198.51.100.1" });
    await rooms("#bubble", { peer: "198.51.100.2" });
    await first.cancel();
    await expect.poll(async () => (await rooms("#bubble", { peer: "198.51.100.3" })).response.status).toBe(200);
  });

  it("stops a stream's beat when the stream ends", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { rooms } = setup();
    const client = await rooms("#bubble");
    expect(vi.getTimerCount()).toBe(1);
    await client.cancel();
    await expect.poll(() => vi.getTimerCount()).toBe(0);
  });

  it("gives the ring to a client whose Last-Event-ID is past its last, as after a clock set back", async () => {
    const { stream, rooms } = setup();
    stream.publish(event(1));
    const back = await rooms("#bubble", { last: "999999999999999" });
    expect(msgids(await back.read(1))).toEqual(["m1"]);
  });

  it("replays two rooms' last events together: the newest it may leave unread, in their order", async () => {
    const { stream, rooms } = setup({ pending: 4 });
    for (let n = 1; n <= 8; n += 1) stream.publish(event(n, n % 2 === 0 ? "#b" : "#a"));
    const late = await rooms("#a,#b");
    const replayed = await late.read(4);
    expect(msgids(replayed)).toEqual(["m5", "m6", "m7", "m8"]);
    expect(replayed.map(({ id }) => Number(id))).toEqual(
      replayed.map(({ id }) => Number(id)).toSorted((x, y) => x - y),
    );
  });

  it("keeps a visitor's other streams counted when one of them ends", async () => {
    const { rooms } = setup();
    const own = [];
    for (let n = 0; n < 4; n += 1) own.push(await rooms("#bubble"));
    await own[0]?.cancel();
    await expect.poll(async () => (await rooms("#bubble")).response.status).toBe(200);
    expect((await rooms("#bubble")).response.status).toBe(429);
  });

  it("replays nothing to a client whose Last-Event-ID is the last it gave", async () => {
    const { stream, rooms } = setup();
    stream.publish(event(1));
    const [given] = await (await rooms("#bubble")).read(1);
    const back = await rooms("#bubble", { peer: "198.51.100.1", last: given?.id ?? "" });
    stream.publish(event(2));
    expect(msgids(await back.read(1))).toEqual(["m2"]);
  });

  it("holds its sizes: a room's ring at its pending, 10,000 rooms at most, nothing left of the streams that ended", async () => {
    const { stream, rooms } = setup({ pending: 8 });
    for (let n = 0; n < 10_000; n += 1) stream.publish(event(n));
    expect(stream.size().events).toBe(8);
    for (let n = 0; n < 10_001; n += 1) stream.publish(event(n, `#r${String(n)}`));
    expect(stream.size().rooms).toBe(10_000);
    const open = [];
    for (let n = 0; n < 50; n += 1) open.push(await rooms("#bubble", { peer: `198.51.100.${String(n)}` }));
    expect(stream.size()).toMatchObject({ clients: 50, visitors: 50 });
    for (const client of open) await client.cancel();
    await expect.poll(() => stream.size()).toMatchObject({ clients: 0, visitors: 0 });
  });
});

describe("StreamEvent", () => {
  it("is a message's id, its room and its state, never its text", () => {
    expect(StreamEvent.parse({ msgid: "m1", room: "#bubble", state: "hidden" })).toEqual({
      msgid: "m1",
      room: "#bubble",
      state: "hidden",
    });
    for (const bad of [
      { msgid: "m1", room: "#bubble", state: "hidden", text: "hello" },
      { msgid: "m1", room: "#bubble", state: "deleted" },
    ]) {
      expect(StreamEvent.safeParse(bad).success).toBe(false);
    }
  });
});
