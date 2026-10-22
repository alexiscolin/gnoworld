import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { logger } from "../log.ts";
import { changes, makeReconciler, type RoomState } from "./reconcile.ts";
import type { Desired } from "./types.ts";

const OPEN: Desired = { modes: "M", invites: [], voiced: [] };
const DESK: Desired = { modes: "Mim", invites: ["g1a", "g1b"], voiced: ["g1a"] };
const BOT = { nick: "gnoworld", powers: "~@" };
const state = (patch: Partial<RoomState> = {}): RoomState => ({
  flags: "Mnt",
  invites: [],
  present: [BOT],
  ...patch,
});

describe("what a room needs to be as its type says", () => {
  it("is nothing for a room already so, its other flags (n, t) left alone", () => {
    expect(changes("#r", state(), OPEN)).toEqual([]);
  });

  it("puts the missing flags on and takes the extra ones off, the reconciler's own flags only", () => {
    expect(changes("#r", state({ flags: "msnt" }), OPEN)).toEqual([
      ["SAMODE", "#r", "+M"],
      ["SAMODE", "#r", "-m"],
      ["SAMODE", "#r", "-s"],
    ]);
    expect(changes("#r", state({ flags: "MRntC" }), { ...OPEN, modes: "Mi" })).toEqual([
      ["SAMODE", "#r", "+i"],
      ["SAMODE", "#r", "-R"],
    ]);
  });

  it("adds the missing invites and removes the others, a wildcard mask included", () => {
    expect(changes("#r", state({ flags: "Mimnt", invites: ["g1b", "g1z", "*!*@*"] }), { ...DESK, voiced: [] })).toEqual(
      [
        ["SAMODE", "#r", "+I", "g1a"],
        ["SAMODE", "#r", "-I", "g1z"],
        ["SAMODE", "#r", "-I", "*!*@*"],
      ],
    );
  });

  it("voices those its type voices who are in the room, and takes voice from the others", () => {
    const present = [BOT, { nick: "g1a", powers: "" }, { nick: "g1b", powers: "+" }];
    expect(changes("#r", state({ flags: "Mimnt", invites: ["g1a", "g1b"], present }), DESK)).toEqual([
      ["SAMODE", "#r", "+v", "g1a"],
      ["SAMODE", "#r", "-v", "g1b"],
    ]);
  });

  it("takes every power above voice from anyone but the bot: founder, admin, op and half-op", () => {
    const present = [BOT, { nick: "alice", powers: "~&@%+" }];
    expect(changes("#r", state({ present }), OPEN)).toEqual([
      ["SAMODE", "#r", "-q", "alice"],
      ["SAMODE", "#r", "-a", "alice"],
      ["SAMODE", "#r", "-o", "alice"],
      ["SAMODE", "#r", "-h", "alice"],
      ["SAMODE", "#r", "-v", "alice"],
    ]);
  });

  it("puts out of a members room whoever is in it and no longer on its list, the bot aside", () => {
    const present = [BOT, { nick: "g1a", powers: "" }, { nick: "g1gone", powers: "" }, { nick: "gus", powers: "" }];
    expect(changes("#r", state({ flags: "Mimnt", invites: ["g1a", "g1b"], present }), { ...DESK, voiced: [] })).toEqual(
      [
        ["KICK", "#r", "g1gone", "not on this room's list"],
        ["KICK", "#r", "gus", "not on this room's list"],
      ],
    );
  });

  // A power given or taken: its prefix added to or taken from the person's.
  const powered = (present: RoomState["present"], mode: string, target: string): RoomState["present"] => {
    const power = { v: "+", o: "@", h: "%", a: "&", q: "~" }[mode.slice(1)] ?? "";
    return present.map((p) =>
      p.nick !== target ? p : { ...p, powers: mode.startsWith("+") ? p.powers + power : p.powers.replace(power, "") },
    );
  };
  // The state a room has once Ergo applied the changes, as 3b's table says it does.
  const apply = (before: RoomState, sent: readonly string[][]): RoomState => {
    let { flags, invites, present } = before;
    for (const [command, , mode = "", target = ""] of sent) {
      if (command === "KICK") present = present.filter(({ nick }) => nick !== mode);
      else if (mode.length === 2 && target === "") {
        flags = mode.startsWith("+") ? flags + mode.slice(1) : flags.replace(mode.slice(1), "");
      } else if (mode.endsWith("I")) {
        invites = mode.startsWith("+") ? [...invites, target] : invites.filter((entry) => entry !== target);
      } else present = powered(present, mode, target);
    }
    return { flags, invites, present };
  };

  it("asks nothing more of a room once its changes are made, whatever the room was (idempotence)", () => {
    const nick = fc.constantFrom("g1a", "g1b", "g1c", "alice");
    const arbitrary = {
      desired: fc.record({
        modes: fc.subarray(["M", "m", "i", "s", "R"]).map((letters) => letters.join("")),
        invites: fc.uniqueArray(nick),
        voiced: fc.uniqueArray(nick),
      }),
      state: fc.record({
        flags: fc
          .uniqueArray(fc.constantFrom("M", "m", "i", "s", "R", "n", "t", "C", "k"))
          .map((letters) => letters.join("")),
        invites: fc.uniqueArray(fc.oneof(nick, fc.constant("*!*@*"))),
        present: fc
          .uniqueArray(fc.record({ nick, powers: fc.subarray(["~", "&", "@", "%", "+"]).map((p) => p.join("")) }), {
            selector: ({ nick: n }) => n,
          })
          .map((people) => [BOT, ...people]),
      }),
    };
    fc.assert(
      fc.property(arbitrary.state, arbitrary.desired, (before, want) => {
        const first = changes("#r", before, want);
        expect(changes("#r", apply(before, first), want)).toEqual([]);
        // A flag it sets or takes off, with no target, is one of the reconciler's own.
        for (const [command, , mode = "", target] of first) {
          if (command === "SAMODE" && target === undefined) expect("MmisR").toContain(mode.slice(1));
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe("the reconciler's pass", () => {
  const quiet = logger("a-pepper-of-forty-characters-0123456789", () => true);

  it("sends each room's changes, logs the rooms it changed, and nothing the second time once Ergo has them", async () => {
    const states = new Map<string, RoomState>([
      ["#a", state({ flags: "nt" })],
      ["#b", state()],
    ]);
    const sent: string[] = [];
    const lines: string[] = [];
    const reconciler = makeReconciler({
      rooms: () => ["#a", "#b"],
      desired: () => OPEN,
      state: (room) => Promise.resolve(states.get(room)),
      send: (command, params) => {
        sent.push([command, ...params].join(" "));
        states.set(params[0] ?? "", state());
        return true;
      },
      log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    });
    await reconciler.pass();
    expect(sent).toEqual(["SAMODE #a +M"]);
    await reconciler.pass();
    expect(sent).toEqual(["SAMODE #a +M"]);
    expect(lines.filter((line) => line.includes('"room_reconciled"'))).toEqual([
      expect.stringContaining('"room":"#a"'),
    ]);
  });

  it("raises the alert when it opens a room that was closed: the roles file made it open", async () => {
    const lines: string[] = [];
    const reconciler = makeReconciler({
      rooms: () => ["#crew"],
      desired: () => OPEN,
      state: () => Promise.resolve(state({ flags: "Mint", invites: ["g1a"] })),
      send: () => true,
      log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    });
    await reconciler.pass();
    expect(lines.filter((line) => line.includes('"event":"alert"'))).toEqual([
      expect.stringContaining('"error":"room_opened","room":"#crew"'),
    ]);
  });

  it("raises no alert for changes that keep a room as closed as it was: flags, a voice, a KICK (F564)", async () => {
    const lines: string[] = [];
    const crew = state({
      flags: "Mint",
      invites: ["g1a", "g1b"],
      present: [BOT, { nick: "g1z", powers: "" }, { nick: "g1a", powers: "" }],
    });
    const reconciler = makeReconciler({
      rooms: () => ["#a", "#crew"],
      desired: (room) => (room === "#a" ? OPEN : DESK),
      state: (room) => Promise.resolve(room === "#a" ? state({ flags: "msnt" }) : crew),
      send: () => true,
      log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    });
    await reconciler.pass();
    expect(lines.filter((line) => line.includes('"room_reconciled"'))).toHaveLength(2);
    expect(lines.filter((line) => line.includes('"event":"alert"'))).toEqual([]);
  });

  it("passes over a room Ergo did not answer for, and runs one pass at a time", async () => {
    let release = (): void => undefined;
    const held = new Promise<undefined>((resolve) => {
      release = () => {
        resolve(undefined);
      };
    });
    let asked = 0;
    const sent: string[] = [];
    const reconciler = makeReconciler({
      rooms: () => ["#a"],
      desired: () => OPEN,
      state: () => {
        asked += 1;
        return asked === 1 ? held : Promise.resolve(undefined);
      },
      send: (command, params) => sent.push([command, ...params].join(" ")) > 0,
      log: quiet,
    });
    const first = reconciler.pass();
    const second = reconciler.pass();
    release();
    await Promise.all([first, second]);
    expect(sent).toEqual([]);
    // A pass asked while one ran comes after it: a JOIN in the middle is not lost.
    await expect.poll(() => asked).toBe(2);
  });

  it("puts each room's flags on at once, before any state is read: a room Ergo lost is closed from its JOIN", () => {
    const sent: string[] = [];
    let asked = 0;
    const reconciler = makeReconciler({
      rooms: () => ["#a", "#b"],
      desired: (room) => (room === "#a" ? { modes: "Mis", invites: ["g1a"], voiced: [] } : OPEN),
      state: () => {
        asked += 1;
        return Promise.resolve(undefined);
      },
      send: (command, params) => sent.push([command, ...params].join(" ")) > 0,
      log: quiet,
    });
    reconciler.flags();
    expect([sent, asked]).toEqual([["SAMODE #a +M", "SAMODE #a +i", "SAMODE #a +s", "SAMODE #b +M"], 0]);
  });

  it("runs a pass after one that found no room", async () => {
    let names: string[] = [];
    const sent: string[] = [];
    const reconciler = makeReconciler({
      rooms: () => names,
      desired: () => OPEN,
      state: () => Promise.resolve(state({ flags: "nt" })),
      send: (command, params) => sent.push([command, ...params].join(" ")) > 0,
      log: quiet,
    });
    await reconciler.pass();
    names = ["#a"];
    await reconciler.pass();
    expect(sent).toEqual(["SAMODE #a +M"]);
  });

  it("goes on past a room whose state fails, and past a command the link refuses", async () => {
    const sent: string[] = [];
    const reconciler = makeReconciler({
      rooms: () => ["#a", "#b"],
      desired: () => OPEN,
      state: (room) => (room === "#a" ? Promise.reject(new Error("closed")) : Promise.resolve(state({ flags: "nt" }))),
      send: (command, params) => {
        sent.push([command, ...params].join(" "));
        return false;
      },
      log: quiet,
    });
    await reconciler.pass();
    await reconciler.pass();
    expect(sent).toEqual(["SAMODE #b +M", "SAMODE #b +M"]);
  });
});
