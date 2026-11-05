import { ChainEvent } from "@gnoworld/schemas/indexer";
import { describe, expect, it, vi } from "vitest";
import { blocks, call, deploy, NAMEREG, registration } from "../../testing/chainRecorded.ts";
import { readChainMessage, type ChainContext } from "./message.ts";

// Slice 9g: one frame of the indexer's subscription becomes the room's events, from the recorded frames (Onyx, 2026-11-05). The
// filter the server asks the indexer for lets other messages through (183 returned, 77 of them `UnexpectedMessage`), so each
// message's realm and function are checked again here, and a call that failed is no vote.
const ACCESS = "gno.land/r/g14wv9hyngyrzpxn3ztvnx2jygs50m0240qncm8j/access";
const bidi = String.fromCodePoint(0x202e);

function setup(watch: ChainContext["watch"] = new Map([[NAMEREG, { world: "bubble" }]])) {
  const log = vi.fn<ChainContext["log"]>();
  return { log, context: { universe: "onyx", watch, log } satisfies ChainContext };
}
// A recorded frame with its transaction changed: the frame is read, changed, written again.
function changed(frame: string, change: (tx: Record<string, unknown>) => void): string {
  const text: unknown = JSON.parse(frame);
  const tx = (text as { payload: { data: { getTransactions: Record<string, unknown> } } }).payload.data.getTransactions;
  change(tx);
  return JSON.stringify(text);
}
// The first message's `value`, which a test changes.
const valueOf = (tx: Record<string, unknown>): Record<string, unknown> =>
  ((tx["messages"] as { value: Record<string, unknown> }[])[0] ?? { value: {} }).value;

describe("a recorded call", () => {
  it("becomes the line of the world that its realm belongs to, with its caller, its function and its block's height", () => {
    const { context, log } = setup();
    const read = readChainMessage(registration(0), context);
    expect(read.events).toEqual([
      {
        id: "jTQy7ZDx+Eee5VDR/EObtTz5tvLV432m4Q6/gjhecw8=:0",
        kind: "call",
        universe: "onyx",
        world: "bubble",
        realm: NAMEREG,
        func: "Register",
        actor: "g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq",
        height: 55414,
      },
    ]);
    expect(ChainEvent.safeParse(read.events[0]).success).toBe(true);
    expect(read.hash).toBe("jTQy7ZDx+Eee5VDR/EObtTz5tvLV432m4Q6/gjhecw8=");
    expect(log).not.toHaveBeenCalled();
  });

  it("gives each event its transaction's hash and its message's place in it, so two like calls of one block are two", () => {
    const { context } = setup();
    const frame = changed(registration(0), (tx) => {
      const [first] = tx["messages"] as unknown[];
      tx["messages"] = [first, first];
    });
    expect(readChainMessage(frame, context).events.map(({ id }) => id)).toEqual([
      "jTQy7ZDx+Eee5VDR/EObtTz5tvLV432m4Q6/gjhecw8=:0",
      "jTQy7ZDx+Eee5VDR/EObtTz5tvLV432m4Q6/gjhecw8=:1",
    ]);
  });

  it("carries neither the args nor the memo of the transaction", () => {
    const { context } = setup();
    const frame = changed(registration(1), (tx) => {
      tx["memo"] = "<img src=x onerror=alert(1)>".repeat(400);
      valueOf(tx)["args"] = [`<b>${"x".repeat(10_000)}</b>`];
    });
    const text = JSON.stringify(readChainMessage(frame, context).events);
    expect(text).not.toContain("<");
    expect(text.length).toBeLessThan(500);
  });

  it("is told by the realm that its path names, whoever the world is: a realm not watched is no line", () => {
    const { context, log } = setup(new Map([[ACCESS, { world: "access" }]]));
    expect(readChainMessage(registration(0), context).events).toEqual([]);
    expect(
      readChainMessage(call, context).events.flatMap((event) => (event.kind === "call" ? [event.world] : [])),
    ).toEqual(["access"]);
    // The filter lets others through: this is normal, not a problem to log.
    expect(log).not.toHaveBeenCalled();
  });

  it("is dropped when its function is not one the world's filter asks for", () => {
    const { context } = setup(new Map([[NAMEREG, { world: "bubble", funcs: new Set(["Other"]) }]]));
    expect(readChainMessage(registration(0), context).events).toEqual([]);
    const { context: asked } = setup(new Map([[NAMEREG, { world: "bubble", funcs: new Set(["Register"]) }]]));
    expect(readChainMessage(registration(0), asked).events).toHaveLength(1);
  });

  it("is dropped when the transaction failed: a vote that did not happen is shown nowhere", () => {
    const { context } = setup();
    const frame = changed(registration(0), (tx) => {
      tx["success"] = false;
    });
    expect(readChainMessage(frame, context).events).toEqual([]);
  });

  it("is dropped, and said, when its function is markup, a bidi override or 10 KB", () => {
    for (const func of ["Vote<img src=x onerror=alert(1)>", `Vote${bidi}`, "A".repeat(10_000)]) {
      const { context, log } = setup();
      const frame = changed(registration(0), (tx) => {
        valueOf(tx)["func"] = func;
      });
      expect(readChainMessage(frame, context).events).toEqual([]);
      expect(log).toHaveBeenCalledWith("chain_message_bad");
    }
  });

  // Red pass: not the actor, not the realm's path, not the height may carry what a stranger wrote to the room.
  it.each([
    ["a caller that is markup", (tx: Record<string, unknown>) => (valueOf(tx)["caller"] = "<script>alert(1)</script>")],
    ["a caller of 10 KB", (tx: Record<string, unknown>) => (valueOf(tx)["caller"] = `g1${"a".repeat(10_000)}`)],
    ["a caller with a bidi override", (tx: Record<string, unknown>) => (valueOf(tx)["caller"] = `${bidi}g1abc`)],
    ["a height of -1", (tx: Record<string, unknown>) => (tx["block_height"] = -1)],
    ["a height that is not whole", (tx: Record<string, unknown>) => (tx["block_height"] = 1.5)],
    ["a height as text", (tx: Record<string, unknown>) => (tx["block_height"] = "5")],
    ["a height past what a number holds exactly", (tx: Record<string, unknown>) => (tx["block_height"] = 2 ** 60)],
  ])("is dropped, and said, with %s", (_, change) => {
    const { context, log } = setup();
    expect(readChainMessage(changed(registration(0), change), context).events).toEqual([]);
    expect(log).toHaveBeenCalledWith("chain_message_bad");
  });

  // The 1 MB cap's own edge: the same watched call, padded by its memo to exactly the cap and to one past it.
  it("is read at exactly 1,000,000 characters and dropped, and said, at one more", () => {
    const sized = (length: number): string => {
      const bare = changed(registration(0), (tx) => (tx["memo"] = "")).length;
      return changed(registration(0), (tx) => (tx["memo"] = "x".repeat(length - bare)));
    };
    const { context, log } = setup();
    expect(sized(1_000_000)).toHaveLength(1_000_000);
    expect(readChainMessage(sized(1_000_000), context).events).toHaveLength(1);
    expect(log).not.toHaveBeenCalled();
    expect(readChainMessage(sized(1_000_001), context).events).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("gives one event for each message of a transaction that the filter lets in, in order, and none for the others", () => {
    const { context } = setup();
    const frame = changed(registration(0), (tx) => {
      const first = (tx["messages"] as unknown[])[0];
      tx["messages"] = [first, { typeUrl: "x", route: "vm", value: { __typename: "UnexpectedMessage" } }, first];
    });
    expect(readChainMessage(frame, context).events.map(({ id }) => id.slice(-2))).toEqual([":0", ":2"]);
  });
});

describe("a recorded deploy", () => {
  it("becomes a deploy event of its creator, in no world, at its block's height", () => {
    const { context } = setup();
    expect(readChainMessage(deploy, context).events).toEqual([
      {
        id: "gmVEDlIQzgG65Fk21gcZeKAmGPc0p4rqdxd/fW02IWM=:0",
        kind: "deploy",
        universe: "onyx",
        realm: "gno.land/r/g1zdyqzhwsg2ayg9rjh8txhgm42ntu0aajda6x7y/smoke/s5f26c0fe/counter",
        actor: "g1zdyqzhwsg2ayg9rjh8txhgm42ntu0aajda6x7y",
        height: 887427,
      },
    ]);
  });

  it.each([
    ["a creator that is markup", (tx: Record<string, unknown>) => (valueOf(tx)["creator"] = "<b>x</b>")],
    ["a path with markup", (tx: Record<string, unknown>) => (valueOf(tx)["package"] = { path: "gno.land/r/<b>x</b>" })],
    [
      "a path of 10 KB",
      (tx: Record<string, unknown>) => (valueOf(tx)["package"] = { path: `gno.land/r/${"a".repeat(10_000)}` }),
    ],
    ["a path of no chain's", (tx: Record<string, unknown>) => (valueOf(tx)["package"] = { path: "example.com/r/x" })],
  ])("is dropped, and said, with %s", (_, change) => {
    const { context, log } = setup();
    expect(readChainMessage(changed(deploy, change), context).events).toEqual([]);
    expect(log).toHaveBeenCalledWith("chain_message_bad");
  });

  it("is no event when it adds a pure package (/p/), or when the transaction failed", () => {
    const { context } = setup();
    const pure = changed(deploy, (tx) => {
      valueOf(tx)["package"] = { path: "gno.land/p/demo/avl", name: "avl" };
    });
    const failed = changed(deploy, (tx) => {
      tx["success"] = false;
    });
    expect(readChainMessage(pure, context).events).toEqual([]);
    expect(readChainMessage(failed, context).events).toEqual([]);
  });
});

describe("a block's frame", () => {
  it("gives the block's height and its time, which a transaction has none of, and no event", () => {
    const { context } = setup();
    const read = readChainMessage(blocks[0] ?? "", context);
    expect(read.events).toEqual([]);
    expect(read.block).toEqual({ height: 908297, time: "2026-11-05T05:01:49.011Z" });
  });
});

describe("what is not a message to read", () => {
  it.each([
    ["no JSON", "not json {"],
    ["a frame that is no next", '{"type":"complete","id":"tx"}'],
    [
      "a next whose payload is no answer",
      '{"type":"next","id":"tx","payload":{"data":{"getTransactions":{"hash":7}}}}',
    ],
    ["a next with errors", '{"type":"next","id":"tx","payload":{"errors":[{"message":"x"}]}}'],
    [
      "a height that is not a number",
      '{"type":"next","id":"blocks","payload":{"data":{"getBlocks":{"height":"1","time":"2026-11-05T05:00:00Z"}}}}',
    ],
    [
      "a block's time that is no date",
      '{"type":"next","id":"blocks","payload":{"data":{"getBlocks":{"height":1,"time":"soon"}}}}',
    ],
  ])("drops %s, and logs it", (_, text) => {
    const { context, log } = setup();
    expect(readChainMessage(text, context)).toEqual({ events: [] });
    expect(log).toHaveBeenCalledWith("chain_message_bad");
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("a message of a matching transaction that fails its schema", () => {
  const without = (key: string) => (tx: Record<string, unknown>) => {
    Reflect.deleteProperty(valueOf(tx), key);
  };
  const set = (key: string, value: unknown) => (tx: Record<string, unknown>) => {
    valueOf(tx)[key] = value;
  };
  it.each([
    ["a call with no caller", registration(1), without("caller")],
    ["a call with no pkg_path", registration(1), without("pkg_path")],
    ["a call with no func", registration(1), without("func")],
    ["a call whose func is a number", registration(1), set("func", 7)],
    ["a call whose caller is an object", registration(1), set("caller", {})],
    ["a deploy with no package", deploy, without("package")],
    ["a deploy with no creator", deploy, without("creator")],
    ["a deploy whose package has no path", deploy, set("package", {})],
  ])("is dropped and logged once, never thrown, for %s", (_, frame, change) => {
    const { context, log } = setup();
    const text = changed(frame, change);
    expect(() => readChainMessage(text, context)).not.toThrow();
    log.mockClear();
    expect(readChainMessage(text, context).events).toEqual([]);
    expect(log).toHaveBeenCalledWith("chain_message_bad");
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("is dropped and logged when it has no kind at all", () => {
    const { context, log } = setup();
    expect(readChainMessage(changed(registration(1), without("__typename")), context).events).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("is no realm, and no fault, when a deploy's path is a pure package's", () => {
    const { context, log } = setup();
    const text = changed(deploy, (tx) => {
      valueOf(tx)["package"] = { path: "gno.land/p/someone/lib" };
    });
    expect(readChainMessage(text, context)).toMatchObject({ events: [] });
    expect(log).not.toHaveBeenCalled();
  });

  it("is no business of a room, and no fault, when it is of another kind", () => {
    const { context, log } = setup();
    const text = changed(registration(1), set("__typename", "BankMsgSend"));
    expect(readChainMessage(text, context)).toMatchObject({ events: [] });
    expect(log).not.toHaveBeenCalled();
  });

  it("is dropped, said, when a next carries data and errors together", () => {
    const { context, log } = setup();
    const text =
      '{"type":"next","id":"blocks","payload":{"data":{"getBlocks":{"height":1,"time":"2026-11-05T05:00:00Z"}},"errors":[{"message":"x"}]}}';
    expect(readChainMessage(text, context)).toEqual({ events: [] });
    expect(log).toHaveBeenCalledTimes(1);
  });
});
