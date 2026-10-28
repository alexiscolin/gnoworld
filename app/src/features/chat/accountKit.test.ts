import { compose, parseLine, type IrcMessage } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { Ergo, Who } from "../../lib/ergo/ergo.ts";
import { createAppStore } from "../../store/index.ts";
import { makeKit, type MakeKit } from "./accountKit.ts";
import { chatLink } from "./link.ts";

// The link's account half (what it sends, the reading places, the notices) is asked for as an account connects, so a
// visitor's page never loads it (ADR-0001 §12; docs/decisions.md, 2026-10-28).
const ALICE = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const T0 = "2026-10-25T10:00:00.000Z";
const line = (text: string): IrcMessage => {
  const parsed = parseLine(text);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${text}`);
  return parsed.message;
};

// A link whose kit comes when the test says, or never comes.
const setup = () => {
  const store = createAppStore();
  const connections: { who: Who; sent: string[]; line: (text: string) => void; state: (s: "connected") => void }[] = [];
  const asked = { kits: 0 };
  const pending: { done: (make: MakeKit) => void; refuse: () => void }[] = [];
  const link = chatLink({
    store,
    ticket: () => Promise.resolve({ ok: true, value: { ticket: "t" } }),
    guest: () => "guest-aaaaaa",
    connect: (who, on) => {
      const sent: string[] = [];
      let connected = false;
      connections.push({
        who,
        sent,
        line: (text) => {
          on.onLine(line(text));
        },
        state: () => {
          connected = true;
          on.onState("connected");
        },
      });
      on.onState("connecting");
      return {
        send: (text) => connected && sent.push(text) > 0,
        stop: () => undefined,
        nick: () => (connected ? ALICE : undefined),
        multiline: () => undefined,
      } satisfies Ergo;
    },
    loadKit: () => {
      asked.kits += 1;
      return new Promise<MakeKit>((done, fail) => {
        pending.push({
          done,
          refuse: () => {
            fail(new Error("the chunk could not be fetched"));
          },
        });
      });
    },
  });
  const { signedIn, signedOut } = store.getState().loginActions;
  const settle = () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  return { store, link, connections, asked, pending, signedIn, signedOut, settle };
};

describe("the chat's link: an account's code, asked for as an account connects", () => {
  it("asks for none as a guest, who connects at once and hears the room", () => {
    const t = setup();
    t.signedOut();
    expect(t.connections).toHaveLength(1);
    t.connections[0]?.state("connected");
    t.link.follow(["#bubble"]);
    t.connections[0]?.line(`@msgid=m1;time=${T0} :bob!u@h PRIVMSG #bubble :hi`);
    expect(t.store.getState().chat.rooms["#bubble"]?.lines.map((each) => each.text)).toEqual(["hi"]);
    expect(t.asked.kits).toBe(0);
  });

  it("makes an account's connection wait for it, asked once however many sessions come", async () => {
    const t = setup();
    t.signedIn(ALICE);
    expect(t.asked.kits).toBe(1);
    expect(t.connections).toHaveLength(0);
    t.pending[0]?.done(makeKit);
    await t.settle();
    expect(t.connections).toHaveLength(1);
    expect(t.connections[0]?.who).toMatchObject({ account: ALICE });
    t.signedOut();
    t.signedIn(ALICE);
    await t.settle();
    expect(t.asked.kits).toBe(1);
    expect(t.connections).toHaveLength(3);
  });

  it("sends for the account once it came", async () => {
    const t = setup();
    t.link.follow(["#bubble"]);
    t.link.show("#bubble");
    t.signedIn(ALICE);
    t.pending[0]?.done(makeKit);
    await t.settle();
    const connection = t.connections[0];
    connection?.state("connected");
    connection?.line(`:${ALICE}!u@h JOIN #bubble`);
    expect(t.link.say("#bubble", compose("#bubble", "hi", ALICE))).toBe(true);
    expect(connection?.sent).toContain("PRIVMSG #bubble :hi");
  });

  it("opens no account's connection for a session that ended while it came", async () => {
    const t = setup();
    t.signedIn(ALICE);
    t.signedOut();
    expect(t.connections).toHaveLength(1);
    t.pending[0]?.done(makeKit);
    await t.settle();
    expect(t.connections).toHaveLength(1);
    expect(t.connections[0]?.who).toHaveProperty("guest");
  });

  it("opens none once stopped", async () => {
    const t = setup();
    t.signedIn(ALICE);
    t.link.stop();
    t.pending[0]?.done(makeKit);
    await t.settle();
    expect(t.connections).toHaveLength(0);
  });

  it("opens the connection to read when its code cannot be fetched", async () => {
    const t = setup();
    t.signedIn(ALICE);
    t.pending[0]?.refuse();
    await t.settle();
    expect(t.connections).toHaveLength(1);
    expect(t.link.say("#bubble", compose("#bubble", "hi", ALICE))).toBe(false);
  });
});
