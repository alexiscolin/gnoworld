import { describe, expect, it, vi } from "vitest";
import { blocks, call, registration } from "../../testing/chainRecorded.ts";
import {
  ACK_MS,
  CATCH_UP_MS,
  followChain,
  HELD,
  IDLE_MS,
  SEEN,
  type ChainSocket,
  type FollowOptions,
} from "./follow.ts";
import type { ChainRead } from "./message.ts";

// Slice 9g: the one subscription of a universe, on `graphql-transport-ws` with Node's own WebSocket. Every test drives fake
// sockets and waits on the follower's own events (a socket opened, an item delivered), never on a timer.
type Listener = (event: { data?: unknown }) => void;
class FakeSocket implements ChainSocket {
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, Listener[]>();
  readonly url: string;
  readonly protocol: string;
  constructor(url: string, protocol: string) {
    this.url = url;
    this.protocol = protocol;
  }
  send(text: string): void {
    this.sent.push(text);
  }
  close(): void {
    this.closed = true;
  }
  addEventListener(type: "open" | "message" | "close" | "error", listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: "open" | "message" | "close" | "error", data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
  /** The server's `connection_ack`, after which the follower subscribes. */
  ack(): void {
    this.emit("open");
    this.emit("message", '{"type":"connection_ack"}');
  }
  types = (): string[] => this.sent.map((text) => (JSON.parse(text) as { type: string }).type);
}

// A transaction at a height, as a recorded frame with its height and hash changed.
function tx(height: number, hash: string): string {
  const frame: unknown = JSON.parse(call);
  const t = (frame as { payload: { data: { getTransactions: Record<string, unknown> } } }).payload.data.getTransactions;
  t["block_height"] = height;
  t["hash"] = hash;
  return JSON.stringify(frame);
}

function setup(over: Partial<FollowOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const delivered: ChainRead[] = [];
  const waits: number[] = [];
  const log = vi.fn<FollowOptions["log"]>();
  // A fake clock: a timer runs when the test fires its length, never by itself.
  const timers: { ms: number; run: () => void; live: boolean }[] = [];
  const fire = (ms: number): void => {
    for (const timer of timers.filter((each) => each.ms === ms && each.live)) timer.run();
  };
  const options: FollowOptions = {
    universe: "onyx",
    url: "wss://indexer.example.test/graphql/query",
    watch: new Map([["gno.land/r/g14wv9hyngyrzpxn3ztvnx2jygs50m0240qncm8j/access", { world: "access" }]]),
    open: (url, protocol) => {
      const socket = new FakeSocket(url, protocol);
      sockets.push(socket);
      return socket;
    },
    catchUp: () => Promise.resolve([]),
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    deliver: (read) => delivered.push(read),
    log,
    after: (ms, run) => {
      const timer = { ms, run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    ...over,
  };
  const follow = followChain(options);
  const socketN = async (n: number): Promise<FakeSocket> => {
    await vi.waitFor(() => {
      expect(sockets.length).toBeGreaterThan(n);
    });
    const socket = sockets[n];
    if (socket === undefined) throw new Error("no socket");
    return socket;
  };
  const heights = () => delivered.flatMap((read) => read.events.map((event) => event.height));
  return { follow, sockets, socketN, delivered, waits, log, heights, fire };
}

describe("the subscription", () => {
  it("opens one socket on the universe's address with the subprotocol, inits, and subscribes once acknowledged", async () => {
    const { socketN, sockets } = setup();
    const socket = await socketN(0);
    expect(sockets).toHaveLength(1);
    expect(socket.url).toBe("wss://indexer.example.test/graphql/query");
    expect(socket.protocol).toBe("graphql-transport-ws");
    socket.emit("open");
    expect(socket.sent.map((text) => JSON.parse(text) as unknown)).toEqual([{ type: "connection_init" }]);
    socket.emit("message", '{"type":"connection_ack"}');
    expect(socket.types()).toEqual(["connection_init", "subscribe", "subscribe"]);
    const asked = socket.sent
      .slice(1)
      .map((text) => (JSON.parse(text) as { payload: { query: string } }).payload.query);
    expect(asked.some((query) => /^subscription\b/.test(query) && query.includes("getTransactions"))).toBe(true);
    expect(asked.some((query) => /^subscription\b/.test(query) && query.includes("getBlocks"))).toBe(true);
  });

  it("answers a ping with a pong", async () => {
    const { socketN } = setup();
    const socket = await socketN(0);
    socket.ack();
    socket.emit("message", '{"type":"ping"}');
    expect(socket.types().at(-1)).toBe("pong");
  });

  it("hands on each frame's read, the recorded blocks and calls alike, and the watched realm's call as an event", async () => {
    const { socketN, delivered } = setup();
    const socket = await socketN(0);
    socket.ack();
    socket.emit("message", blocks[0]);
    socket.emit("message", call);
    expect(delivered.map((read) => read.block?.height ?? read.events[0]?.height)).toEqual([908297, 900030]);
  });

  it("stops: its socket closed, and no socket opened after", async () => {
    const { socketN, follow, sockets } = setup();
    const socket = await socketN(0);
    socket.ack();
    follow.stop();
    expect(socket.closed).toBe(true);
    socket.emit("close");
    await Promise.resolve();
    expect(sockets).toHaveLength(1);
  });
});

describe("the reconnection's backoff", () => {
  it("waits a jittered time that doubles from a second to 30 s and stays there, half of it at least", async () => {
    const low = setup({ random: () => 0 });
    for (let n = 0; n < 8; n += 1) (await low.socketN(n)).emit("close");
    await low.socketN(8);
    expect(low.waits).toEqual([500, 1000, 2000, 4000, 8000, 15_000, 15_000, 15_000]);
    const high = setup({ random: () => 1 });
    for (let n = 0; n < 7; n += 1) (await high.socketN(n)).emit("close");
    await high.socketN(7);
    expect(high.waits).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
  });

  it("starts again from a second after a connection that was acknowledged", async () => {
    const { socketN, waits } = setup({ random: () => 1 });
    (await socketN(0)).emit("close");
    (await socketN(1)).emit("close");
    (await socketN(2)).ack();
    (await socketN(2)).emit("close");
    await socketN(3);
    expect(waits).toEqual([1000, 2000, 1000]);
  });

  it("keeps doubling to 30 s while every catch-up fails, and starts again from a second once one answers", async () => {
    let answers = false;
    const { socketN, waits, log, heights } = setup({
      random: () => 1,
      catchUp: () => (answers ? Promise.resolve([]) : Promise.reject(new Error("the indexer is down"))),
    });
    const first = await socketN(0);
    first.ack();
    first.emit("message", tx(100, "a"));
    first.emit("close");
    for (let n = 1; n <= 6; n += 1) {
      (await socketN(n)).ack();
      await vi.waitFor(() => {
        expect(waits).toHaveLength(n + 1);
      });
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
    expect(log).toHaveBeenCalledWith("chain_catch_up_failed");
    answers = true;
    const healed = await socketN(7);
    healed.ack();
    healed.emit("message", tx(101, "b"));
    // The live frame is held until the catch-up has answered.
    await vi.waitFor(() => {
      expect(heights()).toContain(101);
    });
    healed.emit("close");
    await socketN(8);
    expect(waits.at(-1)).toBe(1000);
  });

  it("reconnects after an error closes the socket too, and logs a refused subscription", async () => {
    const { socketN, log } = setup();
    const socket = await socketN(0);
    socket.ack();
    socket.emit("message", '{"type":"error","id":"tx","payload":[{"message":"no"}]}');
    expect(log).toHaveBeenCalledWith("chain_subscription_refused");
    socket.emit("close");
    await socketN(1);
  });
});

describe("the catch-up by block height", () => {
  it("asks for what came after the highest height it delivered, before any live frame, and misses nothing", async () => {
    const asked = vi.fn((after: number) =>
      Promise.resolve([tx(101, "b"), tx(102, "c"), tx(103, "d")].filter(() => after >= 0)),
    );
    const { socketN, heights } = setup({ catchUp: asked });
    const first = await socketN(0);
    first.ack();
    first.emit("message", tx(100, "a"));
    first.emit("message", tx(101, "b"));
    first.emit("close");
    const second = await socketN(1);
    second.ack();
    await vi.waitFor(() => {
      expect(heights()).toEqual([100, 101, 102, 103]);
    });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked).toHaveBeenCalledWith(101);
    second.emit("message", tx(104, "e"));
    expect(heights()).toEqual([100, 101, 102, 103, 104]);
  });

  it("delivers what the catch-up and the live socket both give once, a transaction of the last height included", async () => {
    const { socketN, heights } = setup({ catchUp: () => Promise.resolve([tx(101, "b"), tx(102, "c"), tx(103, "d")]) });
    const first = await socketN(0);
    first.ack();
    first.emit("message", tx(101, "b"));
    first.emit("close");
    const second = await socketN(1);
    second.ack();
    second.emit("message", tx(103, "d"));
    second.emit("message", tx(103, "d"));
    second.emit("message", tx(104, "e"));
    await vi.waitFor(() => {
      expect(heights()).toEqual([101, 102, 103, 104]);
    });
  });

  it("holds the live frames that come while it is asking, and gives the catch-up first, then them, in height order", async () => {
    const answer = Promise.withResolvers<string[]>();
    const { socketN, heights } = setup({ catchUp: () => answer.promise });
    const first = await socketN(0);
    first.ack();
    first.emit("message", tx(100, "a"));
    first.emit("close");
    const second = await socketN(1);
    second.ack();
    second.emit("message", tx(103, "d"));
    second.emit("message", tx(104, "e"));
    expect(heights()).toEqual([100]);
    answer.resolve([tx(101, "b"), tx(102, "c"), tx(103, "d")]);
    await vi.waitFor(() => {
      expect(heights()).toEqual([100, 101, 102, 103, 104]);
    });
  });

  it("asks nothing on the first connection: there is nothing to catch up on yet", async () => {
    const asked = vi.fn(() => Promise.resolve([]));
    const { socketN } = setup({ catchUp: asked });
    (await socketN(0)).ack();
    expect(asked).not.toHaveBeenCalled();
  });

  it("logs a catch-up that fails and connects again, rather than go on with a gap", async () => {
    const { socketN, log } = setup({ catchUp: () => Promise.reject(new Error("the indexer is down")) });
    const first = await socketN(0);
    first.ack();
    first.emit("message", tx(100, "a"));
    first.emit("close");
    (await socketN(1)).ack();
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith("chain_catch_up_failed");
    });
    await socketN(2);
  });

  it("catches up from the blocks' height too: a block seen is a height reached", async () => {
    const asked = vi.fn(() => Promise.resolve<string[]>([]));
    const { socketN } = setup({ catchUp: asked });
    const first = await socketN(0);
    first.ack();
    first.emit("message", blocks[1]);
    first.emit("close");
    (await socketN(1)).ack();
    await vi.waitFor(() => {
      expect(asked).toHaveBeenCalledWith(908298);
    });
  });
});

// Red pass: a half-open socket never closes by itself; the follower ends what is silent and opens another.
describe("a socket that goes quiet", () => {
  it("is ended and replaced when it never acknowledges, said", async () => {
    const { socketN, fire, log } = setup();
    const socket = await socketN(0);
    socket.emit("open");
    fire(ACK_MS);
    expect(socket.closed).toBe(true);
    expect(log).toHaveBeenCalledWith("chain_socket_timeout");
    await socketN(1);
  });

  it("is ended and replaced when it falls silent after the acknowledgement, and not before", async () => {
    const { socketN, fire, sockets } = setup();
    const socket = await socketN(0);
    socket.ack();
    fire(ACK_MS);
    await Promise.resolve();
    expect(sockets).toHaveLength(1);
    fire(IDLE_MS);
    expect(socket.closed).toBe(true);
    await socketN(1);
  });

  it("is kept by every frame it sends: the idle timer starts again", async () => {
    const { socketN, sockets } = setup();
    const socket = await socketN(0);
    socket.ack();
    socket.emit("message", blocks[0]);
    await Promise.resolve();
    expect(sockets).toHaveLength(1);
  });

  it("fails a catch-up that never answers, said, and connects again", async () => {
    const { socketN, fire, log } = setup({ catchUp: () => new Promise<string[]>(() => undefined) });
    const first = await socketN(0);
    first.ack();
    first.emit("message", tx(100, "a"));
    first.emit("close");
    (await socketN(1)).ack();
    fire(CATCH_UP_MS);
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith("chain_catch_up_failed");
    });
    await socketN(2);
  });
});

describe("a stop in the middle of a wait", () => {
  it("opens no socket when the backoff's wait ends after the stop", async () => {
    const wait = Promise.withResolvers<undefined>();
    const { socketN, follow, sockets } = setup({ wait: () => wait.promise });
    (await socketN(0)).emit("close");
    follow.stop();
    wait.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(sockets).toHaveLength(1);
  });

  it("delivers nothing after a stop that comes while the catch-up is asking", async () => {
    const answer = Promise.withResolvers<string[]>();
    const { socketN, follow, heights } = setup({ catchUp: () => answer.promise });
    const first = await socketN(0);
    first.ack();
    first.emit("message", tx(100, "a"));
    first.emit("close");
    const second = await socketN(1);
    second.ack();
    second.emit("message", tx(104, "e"));
    follow.stop();
    answer.resolve([tx(101, "b")]);
    await Promise.resolve();
    await Promise.resolve();
    expect(heights()).toEqual([100]);
  });
});

describe("what the follower holds", () => {
  it("keeps the hashes of its last 10,000 transactions: an old one may come again, the last one never", async () => {
    const { socketN, heights } = setup();
    const socket = await socketN(0);
    socket.ack();
    for (let n = 0; n < SEEN + 5; n += 1) socket.emit("message", tx(n, `h${String(n)}`));
    expect(heights()).toHaveLength(SEEN + 5);
    socket.emit("message", tx(SEEN + 4, `h${String(SEEN + 4)}`));
    expect(heights()).toHaveLength(SEEN + 5);
    socket.emit("message", tx(0, "h0"));
    expect(heights()).toHaveLength(SEEN + 6);
  });

  it("holds 10,000 live frames at most while a catch-up asks: the oldest dropped, said, the newest kept", async () => {
    const answer = Promise.withResolvers<string[]>();
    const { socketN, heights, log } = setup({ catchUp: () => answer.promise });
    const first = await socketN(0);
    first.ack();
    first.emit("message", tx(1, "first"));
    first.emit("close");
    const second = await socketN(1);
    second.ack();
    for (let n = 0; n < HELD + 3; n += 1) second.emit("message", tx(10 + n, `l${String(n)}`));
    expect(log).toHaveBeenCalledWith("chain_held_dropped");
    answer.resolve([]);
    await vi.waitFor(() => {
      expect(heights()).toHaveLength(HELD + 1);
    });
    expect(heights().at(-1)).toBe(10 + HELD + 2);
    expect(heights()).not.toContain(10);
  });
});

describe("the registration recorded on the same watch", () => {
  it("is no line when its realm is not watched: the indexer's other messages are read, dropped, and not logged", async () => {
    const { socketN, delivered, log } = setup();
    const socket = await socketN(0);
    socket.ack();
    socket.emit("message", registration(0));
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.events).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });
});
