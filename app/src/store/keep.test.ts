import { parseLine, type IrcMessage, type Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { DEVICE_EMPTY, type Device, type DeviceField, type DeviceFields } from "../lib/keep/fields.ts";
import { keep } from "../lib/keep/keep.ts";
import { createAppStore } from "./index.ts";

// The keep slice (slice 4's 4d; docs/decisions.md, 2026-10-26: "fields are added only"): what an account keeps on its
// device, the lines it saved and, for each room, the reading place it asked to go back to; read once at its session's
// start, written back on change, never over a device that could not be read.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const line = (id: string, over: Partial<Line> = {}): Line => ({
  id,
  time: T(1),
  from: BOB,
  account: BOB,
  text: `line ${id}`,
  kind: "message",
  ...over,
});

// A guest's line: its nick, and no account tag.
const guest = (id: string): Line => ({
  id,
  time: T(1),
  from: "guest-ab12cd",
  text: `line ${id}`,
  kind: "message",
});

function setup({ refuses = false } = {}) {
  const kept = new Map<string, string>();
  // `blind`: a key prefix the device cannot read; `noWrite`: it reads but refuses what is written.
  const state = { refuses, blind: "", noWrite: false, reads: 0 };
  const storage = {
    getItem: (key: string) => {
      state.reads += 1;
      if (state.blind !== "" && key.startsWith(state.blind)) throw new DOMException("blocked", "SecurityError");
      if (state.refuses) throw new DOMException("blocked", "SecurityError");
      return kept.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (state.refuses || state.noWrite) throw new DOMException("blocked", "SecurityError");
      kept.set(key, value);
    },
    removeItem: (key: string) => {
      if (state.refuses || state.noWrite) throw new DOMException("blocked", "SecurityError");
      kept.delete(key);
    },
  };
  const store = createAppStore();
  const device = (account: Address = ALICE) => keep(() => storage, account);
  const told = { n: 0 };
  store.subscribe(() => (told.n += 1));
  return { store, kept, state, device, told, ...store.getState().keepActions, now: () => store.getState().keep };
}

describe("the keep slice's start", () => {
  it("holds nothing, and notes no refusal, before a session", () => {
    expect(setup().now()).toEqual({ saved: [], unread: {}, notKept: false });
  });

  it("reads the account's saved lines and places from its device at its session's start", () => {
    const t = setup();
    const mine = t.device();
    mine.setSaved([{ room: "#bubble", id: "m1", time: T(1), from: BOB, account: BOB, text: "kept" }]);
    mine.setUnread({ "#bubble": T(0) });
    t.begin(t.device());
    expect(t.now()).toEqual({
      saved: [{ room: "#bubble", id: "m1", time: T(1), from: BOB, account: BOB, text: "kept" }],
      unread: { "#bubble": T(0) },
      notKept: false,
    });
  });

  it("forgets the last session's when another begins, an account's being its own, and a guest's holding none", () => {
    const t = setup();
    t.begin(t.device(ALICE));
    t.save("#bubble", line("m1"));
    t.markUnread("#bubble", line("m1"));
    t.begin(t.device(BOB));
    expect(t.now()).toEqual({ saved: [], unread: {}, notKept: false });
    t.begin(t.device(ALICE));
    expect(t.now().saved).toHaveLength(1);
    t.begin(undefined);
    expect(t.now()).toEqual({ saved: [], unread: {}, notKept: false });
  });

  it("tells subscribers once for a change, and none for a start that changes nothing", () => {
    const t = setup();
    t.begin(t.device());
    t.begin(t.device());
    expect(t.told.n).toBe(0);
    t.save("#bubble", line("m1"));
    expect(t.told.n).toBe(1);
  });
});

describe("saving a line", () => {
  it("keeps its room, id, time, author and text, newest saved first, on the device", () => {
    const t = setup();
    t.begin(t.device());
    expect(t.save("#bubble", line("m1"))).toBe("saved");
    expect(t.save("#bubble/games", guest("m2"))).toBe("saved");
    expect(t.now().saved).toEqual([
      { room: "#bubble/games", id: "m2", time: T(1), from: "guest-ab12cd", text: "line m2" },
      { room: "#bubble", id: "m1", time: T(1), from: BOB, account: BOB, text: "line m1" },
    ]);
    expect(t.device().saved()).toEqual(t.now().saved);
  });

  it("saves a line once: again changes nothing, the same id in another room being another line", () => {
    const t = setup();
    t.begin(t.device());
    t.save("#bubble", line("m1"));
    const before = t.now();
    expect(t.save("#bubble", line("m1"))).toBe("saved");
    expect(t.now()).toBe(before);
    t.save("#bubble/games", line("m1"));
    expect(t.now().saved).toHaveLength(2);
  });

  it("refuses the 201st, as full, and holds what it held", () => {
    const t = setup();
    t.begin(t.device());
    for (let n = 0; n < 200; n += 1) expect(t.save("#bubble", line(`m${String(n)}`))).toBe("saved");
    const before = t.now();
    expect(t.save("#bubble", line("one-more"))).toBe("full");
    expect(t.now()).toBe(before);
    expect(t.device().saved()).toHaveLength(200);
    // One removed leaves room, and an already saved line is never "full".
    t.unsave("#bubble", "m0");
    expect(t.save("#bubble", line("one-more"))).toBe("saved");
    expect(t.save("#bubble", line("m1"))).toBe("saved");
  });

  it("saves nothing for a guest, which has no device", () => {
    const t = setup();
    t.begin(undefined);
    expect(t.save("#bubble", line("m1"))).toBe("none");
    expect(t.now().saved).toEqual([]);
  });

  it("removes a saved line, from the device too, and changes nothing for one it does not hold", () => {
    const t = setup();
    t.begin(t.device());
    t.save("#bubble", line("m1"));
    t.save("#bubble", line("m2"));
    const before = t.now();
    t.unsave("#bubble/games", "m1");
    t.unsave("#bubble", "nope");
    expect(t.now()).toBe(before);
    t.unsave("#bubble", "m1");
    expect(t.now().saved.map(({ id }) => id)).toEqual(["m2"]);
    expect(
      t
        .device()
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(["m2"]);
  });
});

describe("marking a line unread", () => {
  it("keeps, for its room, the place just before the line, on the device", () => {
    const t = setup();
    t.begin(t.device());
    t.markUnread("#bubble", line("m1", { time: T(5) }));
    expect(t.now().unread).toEqual({ "#bubble": "2026-10-25T10:04:59.999Z" });
    expect(t.device().unread()).toEqual(t.now().unread);
  });

  it("moves a room's place to another line, forward as well as back, and leaves other rooms' alone", () => {
    const t = setup();
    t.begin(t.device());
    t.markUnread("#bubble", line("m1", { time: T(5) }));
    t.markUnread("#bubble/games", line("g1", { time: T(2) }));
    t.markUnread("#bubble", line("m2", { time: T(9) }));
    expect(t.now().unread).toEqual({
      "#bubble": "2026-10-25T10:08:59.999Z",
      "#bubble/games": "2026-10-25T10:01:59.999Z",
    });
  });

  it("keeps 100 rooms' places at most, the room marked longest ago going first", () => {
    const t = setup();
    t.begin(t.device());
    for (let n = 0; n <= 100; n += 1) t.markUnread(`#world-${String(n)}`, line("m", { time: T(1) }));
    expect(Object.keys(t.now().unread)).toHaveLength(100);
    expect(Object.hasOwn(t.now().unread, "#world-0")).toBe(false);
    expect(Object.hasOwn(t.now().unread, "#world-100")).toBe(true);
  });

  // A room marked again is the newest marked: it outlasts those marked before it when the bound comes (4d's R16).
  it("takes a room marked again as the newest, so it is not the one that goes first", () => {
    const t = setup();
    t.begin(t.device());
    for (let n = 0; n < 100; n += 1) t.markUnread(`#world-${String(n)}`, line("m", { time: T(1) }));
    t.markUnread("#world-0", line("m", { time: T(2) }));
    t.markUnread("#world-100", line("m", { time: T(1) }));
    expect(Object.hasOwn(t.now().unread, "#world-0")).toBe(true);
    expect(Object.hasOwn(t.now().unread, "#world-1")).toBe(false);
  });

  it("marks nothing for a guest, or for a line whose time is no time Ergo gave", () => {
    const t = setup();
    t.begin(undefined);
    t.markUnread("#bubble", line("m1"));
    t.begin(t.device());
    t.markUnread("#bubble", line("m1", { time: "yesterday" }));
    expect(t.now().unread).toEqual({});
  });

  it("clears a room's place once the reader has read through, on the device too, and changes nothing for a room with none", () => {
    const t = setup();
    t.begin(t.device());
    t.markUnread("#bubble", line("m1"));
    t.markUnread("#bubble/games", line("g1"));
    const before = t.now();
    t.readThrough("#elsewhere");
    expect(t.now()).toBe(before);
    t.readThrough("#bubble");
    expect(Object.keys(t.now().unread)).toEqual(["#bubble/games"]);
    expect(Object.keys(t.device().unread() ?? {})).toEqual(["#bubble/games"]);
  });

  it("reads a room named __proto__ as a room, never as everyone's place", () => {
    const t = setup();
    t.begin(t.device());
    t.markUnread("__proto__", line("m1"));
    expect(Object.keys(t.now().unread)).toEqual([]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("a device that fails", () => {
  it("keeps what was asked in memory for the session, and says the device did not keep it", () => {
    const t = setup();
    t.begin(t.device());
    t.state.refuses = true;
    expect(t.save("#bubble", line("m1"))).toBe("saved");
    expect(t.now().saved).toHaveLength(1);
    expect(t.now().notKept).toBe(true);
    t.state.refuses = false;
    t.begin(t.device());
    expect(t.now()).toEqual({ saved: [], unread: {}, notKept: false });
  });

  // Written over an unreadable device, a good one's lines would be lost for good.
  it("writes nothing over a device it could not read, and says so from the start", () => {
    const t = setup();
    t.device().setSaved([{ room: "#bubble", id: "m1", time: T(1), from: BOB, text: "precious" }]);
    t.state.refuses = true;
    t.begin(t.device());
    expect(t.now().notKept).toBe(true);
    t.state.refuses = false;
    t.save("#bubble", line("m2"));
    t.markUnread("#bubble", line("m2"));
    t.unsave("#bubble", "m2");
    expect(
      t
        .device()
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(["m1"]);
    expect(t.device().unread()).toEqual({});
  });
});

// Which key could not be read decides nothing: written over, it would lose what it held (G2).
describe("a device with one key it cannot read", () => {
  const GOOD = [{ room: "#bubble", id: "m1", time: T(1), from: BOB, text: "precious" }];
  it.each([
    ["saved", "gnoworld:saved:"],
    ["unread", "gnoworld:unread:"],
  ])("writes neither key, and says so, when the %s key is unreadable from the start", (_, blind) => {
    const t = setup();
    t.device().setSaved(GOOD);
    t.device().setUnread({ "#bubble": T(0) });
    t.state.blind = blind;
    t.begin(t.device());
    expect(t.now().notKept).toBe(true);
    t.state.blind = "";
    t.save("#bubble", line("m2"));
    t.markUnread("#bubble", line("m2"));
    t.unsave("#bubble", "m1");
    t.readThrough("#bubble");
    expect(t.device().saved()).toEqual(GOOD);
    expect(t.device().unread()).toEqual({ "#bubble": T(0) });
  });

  it.each([
    ["saved", "gnoworld:saved:"],
    ["unread", "gnoworld:unread:"],
  ])("writes neither key when the %s key becomes unreadable after the start", (_, blind) => {
    const t = setup();
    t.device().setSaved(GOOD);
    t.device().setUnread({ "#bubble": T(0) });
    t.begin(t.device());
    t.state.blind = blind;
    t.save("#bubble", line("m2"));
    t.markUnread("#bubble", line("m2"));
    t.state.blind = "";
    expect(t.device().saved()).toEqual(GOOD);
    expect(t.device().unread()).toEqual({ "#bubble": T(0) });
    expect(t.now().notKept).toBe(true);
  });
});

// The warning that the device kept nothing shows only when that is so (G3).
describe("the warning that the device did not keep", () => {
  const actions: [string, (t: ReturnType<typeof setup>) => void][] = [
    [
      "a save",
      (t) => {
        t.save("#bubble", line("m2"));
      },
    ],
    [
      "an unsave",
      (t) => {
        t.unsave("#bubble", "m1");
      },
    ],
    [
      "a mark",
      (t) => {
        t.markUnread("#bubble", line("m2", { time: T(2) }));
      },
    ],
    [
      "a read-through",
      (t) => {
        t.readThrough("#bubble");
      },
    ],
  ];
  const held = (t: ReturnType<typeof setup>) => {
    t.begin(t.device());
    t.save("#bubble", line("m1"));
    t.markUnread("#bubble", line("m1"));
  };
  it.each(actions)("stays off for %s on a device that keeps it", (_, act) => {
    const t = setup();
    held(t);
    act(t);
    expect(t.now().notKept).toBe(false);
    expect(t.device().saved()).toEqual(t.now().saved);
    expect(t.device().unread()).toEqual(t.now().unread);
  });
  it.each(actions)("comes on for %s on a device that refuses what is written", (_, act) => {
    const t = setup();
    held(t);
    t.state.noWrite = true;
    act(t);
    expect(t.now().notKept).toBe(true);
  });
});

describe("marking a room's place again", () => {
  it("keeps the 100 rooms held, the oldest among them, and puts the room marked last", () => {
    const t = setup();
    t.begin(t.device());
    for (let n = 0; n < 100; n += 1) t.markUnread(`#world-${String(n)}`, line("m", { time: T(1) }));
    t.markUnread("#world-49", line("m", { time: T(2) }));
    const rooms = Object.keys(t.now().unread);
    expect(rooms).toHaveLength(100);
    expect(rooms[0]).toBe("#world-0");
    expect(rooms.at(-1)).toBe("#world-49");
  });
});

// A guest has no device: nothing it does is kept or throws, whatever an account left on the same device (G9).
describe("a guest", () => {
  it("changes nothing by marking, unsaving or reading through, and the state read is its own", () => {
    const t = setup();
    t.device(ALICE).setSaved([{ room: "#bubble", id: "m1", time: T(1), from: BOB, text: "hers" }]);
    t.device(ALICE).setUnread({ "#bubble": T(0) });
    t.begin(undefined);
    t.markUnread("#bubble", line("m2"));
    t.unsave("#bubble", "m1");
    t.readThrough("#bubble");
    expect(t.now()).toEqual({ saved: [], unread: {}, notKept: false });
    expect(t.device(ALICE).saved()).toHaveLength(1);
    expect(t.device(ALICE).unread()).toEqual({ "#bubble": T(0) });
  });

  it("marks nothing for a direct message's partner", () => {
    const t = setup();
    t.begin(t.device());
    t.markUnread(BOB, line("m1"));
    expect(t.now().unread).toEqual({});
    expect(t.device().unread()).toEqual({});
  });
});

// A room that is no room's, a direct message among them, has no device to keep a line on, nor has a line that is no plain
// message: a saved one would vanish at the next reading, or lose what made it an /me (4d's R12).
describe("what is saved is a plain message of a room", () => {
  it.each([
    ["a direct message's partner", "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", line("m1")],
    ["a name that is no room's", "bubble", line("m1")],
    ["an /me, which would lose its form", "#bubble", line("m1", { kind: "action" })],
    ["a notice, which would lose its form", "#bubble", line("m1", { kind: "notice" })],
    ["a line of an id that is no id", "#bubble", line("a,b")],
  ])("saves nothing for %s", (_, room, said) => {
    const t = setup();
    t.begin(t.device());
    expect(t.save(room, said)).toBe("none");
    expect(t.now().saved).toEqual([]);
    expect(t.device().saved()).toEqual([]);
  });
});

// Two tabs of one account on one device: each starts from what it read, and a write of its whole list would drop what
// the other saved since (4d's R10).
describe("two sessions of one account on one device", () => {
  it("keep every line each saved: the device holds both", () => {
    const kept = new Map<string, string>();
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    };
    const [a, b] = [createAppStore(), createAppStore()];
    for (const store of [a, b]) store.getState().keepActions.begin(keep(() => storage, ALICE));
    a.getState().keepActions.save("#bubble", line("m1"));
    b.getState().keepActions.save("#bubble", line("m2"));
    a.getState().keepActions.markUnread("#bubble", line("m1", { time: T(5) }));
    b.getState().keepActions.markUnread("#bubble/games", line("g1", { time: T(2) }));
    expect(
      keep(() => storage, ALICE)
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(["m2", "m1"]);
    expect(Object.keys(keep(() => storage, ALICE).unread() ?? {})).toEqual(["#bubble", "#bubble/games"]);
    // Each takes the other's lines in as its own next change comes.
    expect(b.getState().keep.saved.map(({ id }) => id)).toEqual(["m2", "m1"]);
  });

  it("do not bring back a line the other removed", () => {
    const kept = new Map<string, string>();
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    };
    const [a, b] = [createAppStore(), createAppStore()];
    a.getState().keepActions.begin(keep(() => storage, ALICE));
    a.getState().keepActions.save("#bubble", line("m1"));
    b.getState().keepActions.begin(keep(() => storage, ALICE));
    a.getState().keepActions.unsave("#bubble", "m1");
    b.getState().keepActions.save("#bubble", line("m2"));
    expect(
      keep(() => storage, ALICE)
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(["m2"]);
  });
});

// The memory of a session can equal the lines it writes while the device holds others: a write skipped for "no change"
// would leave the device without them (F1488, the code review's CR7).
describe("a session whose memory is behind the device", () => {
  const tabs = () => {
    const kept = new Map<string, string>();
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    };
    const [a, b] = [createAppStore(), createAppStore()];
    const device = () => keep(() => storage, ALICE);
    a.getState().keepActions.begin(device());
    // The second tab opens once the first has kept a line and a place, so it starts with them.
    a.getState().keepActions.save("#bubble", line("m1"));
    a.getState().keepActions.markUnread("#bubble", line("m1", { time: T(5) }));
    b.getState().keepActions.begin(device());
    return { a, b, device };
  };

  it("writes a line again that another tab removed, though its own memory still holds it", () => {
    const { a, b, device } = tabs();
    b.getState().keepActions.unsave("#bubble", "m1");
    expect(a.getState().keepActions.save("#bubble", line("m1"))).toBe("saved");
    expect(
      device()
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(["m1"]);
  });

  it("takes a place another tab forgot from the device, though only a line was saved here", () => {
    const { a, b, device } = tabs();
    b.getState().keepActions.readThrough("#bubble");
    a.getState().keepActions.save("#bubble", line("m2"));
    expect(a.getState().keep.unread).toEqual({});
    expect(device().unread()).toEqual({});
    expect(
      device()
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(["m2", "m1"]);
  });

  // The device is right and the memory behind: a change that alters neither still brings the memory up to the device
  // (R7 of redpass2-4dx), or the list shows lines the next change would find gone.
  it("takes the device's lines into its memory when a change changes nothing on the device", () => {
    const { a, b, device } = tabs();
    b.getState().keepActions.save("#bubble", line("m2"));
    expect(a.getState().keep.saved.map(({ id }) => id)).toEqual(["m1"]);
    a.getState().keepActions.unsave("#bubble", "nope");
    expect(a.getState().keep.saved.map(({ id }) => id)).toEqual(["m2", "m1"]);
    expect(
      device()
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(["m2", "m1"]);
  });
});

// A logout ends the session's memory, never the device's: the lines stay for the account's next login, which the list's own
// words say ("Saved on this device only", 4d's R20).
describe("a session's end", () => {
  it("leaves the account's saved lines and places on its device", () => {
    const t = setup();
    t.begin(t.device());
    t.save("#bubble", line("m1"));
    t.markUnread("#bubble", line("m1", { time: T(5) }));
    t.begin(undefined);
    expect(t.now()).toEqual({ saved: [], unread: {}, notKept: false });
    expect(
      t
        .device()
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(["m1"]);
    expect(Object.keys(t.device().unread() ?? {})).toEqual(["#bubble"]);
    t.begin(t.device());
    expect(t.now().saved.map(({ id }) => id)).toEqual(["m1"]);
  });
});

const heard = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};

// F2090 (AP1): the device is read for a REDACT or an edit alone, never for each live line of a busy room.
describe("a live line heard by the keep slice", () => {
  const said = `@msgid=m9;time=${T(2)};account=${BOB} :${BOB}!u@h PRIVMSG #bubble :hello`;
  it("reads the device for no line that is no REDACT and no edit", () => {
    const t = setup();
    t.begin(t.device());
    t.save("#bubble", line("m1"));
    const before = t.state.reads;
    for (const text of [
      said,
      `:${BOB}!u@h JOIN #bubble`,
      `:${BOB}!u@h PART #bubble`,
      `@+typing=active;account=${BOB} :${BOB}!u@h TAGMSG #bubble`,
    ])
      t.heard(heard(text));
    expect(t.state.reads).toBe(before);
    expect(t.now().saved.map(({ id }) => id)).toEqual(["m1"]);
  });

  it("still reads it to unsave a REDACTed line, and to take an edit's words", () => {
    const t = setup();
    t.begin(t.device());
    t.save("#bubble", line("m1"));
    t.save("#bubble", line("m2"));
    t.heard(heard(`@msgid=e1;time=${T(3)};account=${BOB};+gnoworld/edit=m2 :${BOB}!u@h PRIVMSG #bubble :corrected`));
    expect(t.now().saved.find(({ id }) => id === "m2")?.text).toBe("corrected");
    t.heard(heard(`@msgid=r1;time=${T(4)};account=${BOB} :${BOB}!u@h REDACT #bubble m1`));
    expect(t.now().saved.map(({ id }) => id)).toEqual(["m2"]);
  });
});

// The device slice of the store (slice 8; lib/keep's rule): every field read at the page's start and again when another tab changes it;
// a change made from what the device holds now, so another tab's change is kept; never written over a device that could not be read.
function fake() {
  const fields: Partial<DeviceFields> = {};
  const state = { blind: new Set<DeviceField>(), refuses: false, writes: 0 };
  const device: Device = {
    keys: Object.fromEntries(Object.keys(DEVICE_EMPTY).map((field) => [field, field])) as Device["keys"],
    read: (field) => (state.blind.has(field) ? undefined : (fields[field] ?? DEVICE_EMPTY[field])),
    write: (field, value) => {
      state.writes += 1;
      if (state.refuses) return false;
      Object.assign(fields, { [field]: value });
      return true;
    },
  };
  return { device, fields, state };
}

describe("the device in the store", () => {
  it("holds the defaults, unreadable, before the page reads the device", () => {
    const store = createAppStore();
    expect(store.getState().device).toEqual({ ...DEVICE_EMPTY, readable: false, notKept: false });
  });

  it("writes nothing before the device is read, and says the change was not kept", () => {
    const store = createAppStore();
    expect(store.getState().deviceActions.change("stamps", () => ({ "g:a": "2026-11-05" }))).toBe(false);
    expect(store.getState().device.stamps).toEqual({ "g:a": "2026-11-05" });
    expect(store.getState().device.notKept).toBe(true);
  });

  it("reads every field at the start", () => {
    const { device, fields } = fake();
    fields.stamps = { "g:a": "2026-11-01" };
    fields.settings = { quality: "low", calm: true, phone3d: false };
    const store = createAppStore();
    store.getState().deviceActions.load(device);
    const { device: kept } = store.getState();
    expect(kept.stamps).toEqual({ "g:a": "2026-11-01" });
    expect(kept.settings).toEqual({ quality: "low", calm: true, phone3d: false });
    expect(kept.readable).toBe(true);
    expect(kept.notKept).toBe(false);
  });

  it("keeps another tab's change: a change starts from what the device holds now", () => {
    const { device, fields } = fake();
    const store = createAppStore();
    store.getState().deviceActions.load(device);
    fields.stamps = { "g:other-tab": "2026-11-04" };
    expect(store.getState().deviceActions.change("stamps", (held) => ({ ...held, "g:here": "2026-11-05" }))).toBe(true);
    expect(fields.stamps).toEqual({ "g:other-tab": "2026-11-04", "g:here": "2026-11-05" });
    expect(store.getState().device.stamps).toEqual(fields.stamps);
  });

  it("takes another tab's change on a load, which the page does on the storage event", () => {
    const { device, fields } = fake();
    const store = createAppStore();
    store.getState().deviceActions.load(device);
    fields.follows = { worlds: ["g:a"], people: [] };
    store.getState().deviceActions.load(device);
    expect(store.getState().device.follows).toEqual({ worlds: ["g:a"], people: [] });
  });

  it("never writes a device it could not read whole, keeps the change in memory, and says so", () => {
    const { device, fields, state } = fake();
    fields.stamps = { "g:kept": "2026-11-01" };
    state.blind.add("charted");
    const store = createAppStore();
    store.getState().deviceActions.load(device);
    expect(store.getState().device.readable).toBe(false);
    expect(store.getState().device.notKept).toBe(true);
    expect(store.getState().deviceActions.change("stamps", (held) => ({ ...held, "g:new": "2026-11-05" }))).toBe(false);
    expect(state.writes).toBe(0);
    expect(fields.stamps).toEqual({ "g:kept": "2026-11-01" });
    expect(store.getState().device.stamps).toEqual({ "g:kept": "2026-11-01", "g:new": "2026-11-05" });
  });

  it("never writes a field the device cannot read at the change, though it read whole at the start", () => {
    const { device, fields, state } = fake();
    fields.stamps = { "g:kept": "2026-11-01" };
    const store = createAppStore();
    store.getState().deviceActions.load(device);
    state.blind.add("stamps");
    expect(store.getState().deviceActions.change("stamps", () => ({}))).toBe(false);
    expect(state.writes).toBe(0);
    expect(fields.stamps).toEqual({ "g:kept": "2026-11-01" });
    expect(store.getState().device.notKept).toBe(true);
  });

  it("says a write the device refused was not kept, and keeps the change in memory", () => {
    const { device, state } = fake();
    const store = createAppStore();
    store.getState().deviceActions.load(device);
    state.refuses = true;
    expect(store.getState().deviceActions.change("settings", (held) => ({ ...held, calm: true }))).toBe(false);
    expect(store.getState().device.settings.calm).toBe(true);
    expect(store.getState().device.notKept).toBe(true);
  });

  it("writes nothing and changes no state for a change that leaves the field as it is", () => {
    const { device, state } = fake();
    const store = createAppStore();
    store.getState().deviceActions.load(device);
    const before = store.getState().device;
    expect(store.getState().deviceActions.change("settings", (held) => ({ ...held }))).toBe(true);
    expect(state.writes).toBe(0);
    expect(store.getState().device).toBe(before);
  });

  it("changes one field alone", () => {
    const { device, fields } = fake();
    fields.stamps = { "g:a": "2026-11-01" };
    fields.follows = { worlds: ["g:a"], people: [] };
    const store = createAppStore();
    store.getState().deviceActions.load(device);
    store.getState().deviceActions.change("stamps", () => ({}));
    expect(fields.follows).toEqual({ worlds: ["g:a"], people: [] });
    expect(store.getState().device.follows).toEqual({ worlds: ["g:a"], people: [] });
    expect(store.getState().device.stamps).toEqual({});
  });
});
