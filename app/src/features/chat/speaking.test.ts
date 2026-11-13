// @vitest-environment jsdom
import { compose, lineOf, parseLine } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { Address } from "@gnoworld/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepCountry } from "../../lib/country.ts";
import type { Ergo } from "../../lib/ergo/ergo.ts";
import { createAppStore } from "../../store/index.ts";
import { makeKit } from "./accountKit.ts";

// 7j, amended by D395: the country tag going out (ADR-0001 §7). It says where a person speaks from, so it rides only on a person's own new
// line, only while they show a country (the one they chose, else their time zone's, none once they hid it), and only in a room the list
// says anyone may read. The time zone is Tokyo's for every test, so the default is the same wherever it runs.
const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const ROOM = "#earth";
type RoomType = RoomList["sections"][number]["rooms"][number]["type"];

interface Setup {
  /** The room's type on the list; null while no list came. */
  type?: RoomType | null;
  multiline?: boolean;
  /** The room the list holds. */
  listed?: string;
}

function setup({ type = "open", multiline = true, listed = ROOM }: Setup = {}) {
  const store = createAppStore();
  let key: string = ME;
  if (type !== null) store.getState().chatActions.listed([{ name: null, rooms: [{ room: listed, type }] }]);
  const sent: string[] = [];
  const ergo: Ergo = {
    send: (line) => {
      sent.push(line);
      return true;
    },
    stop: () => undefined,
    multiline: () => multiline,
    nick: () => ME,
  };
  const kit = makeKit({
    store,
    ergo: () => ergo,
    key: () => key,
    out: (line) => ergo.send(line),
    inside: new Set([ROOM]),
  });
  const { speaking } = kit;
  const heard = (line: string) => {
    const parsed = parseLine(line);
    if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
    kit.heard(parsed.message);
  };
  const list = (...types: (RoomType | undefined)[]) => {
    store
      .getState()
      .chatActions.listed(
        types.map((each) => ({ name: null, rooms: each === undefined ? [] : [{ room: ROOM, type: each }] })),
      );
  };
  return { sent, speaking, store, list, heard, login: (next: string) => (key = next) };
}
const said = (draft: string) => compose(ROOM, draft, ME);
// What the page sent as Ergo relays it to a room: its own tags, with an id, a time, an account and a source.
function relayed(line: string) {
  const [tags = "", ...rest] = line.slice(1).split(" ");
  const parsed = parseLine(
    `@msgid=a1;time=2026-11-02T00:00:00.000Z;account=${ME};${tags} :${ME}!u@h ${rest.join(" ")}`,
  );
  if (!parsed.ok) throw new Error(`the relayed line does not parse: ${line}`);
  return parsed.message;
}

beforeEach(() => {
  const zone = new Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ ...zone, timeZone: "Asia/Tokyo" });
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("a line and the country its speaker declares", () => {
  it("carries none once the account hid its country: no tag, no country", () => {
    keepCountry(ME, undefined);
    const { sent, speaking } = setup();
    expect(speaking.say(ROOM, said("hi"))).toBe(true);
    expect(sent).toEqual([`PRIVMSG ${ROOM} :hi`]);
  });

  it.each(["open", "announcement"] as const)("carries the country chosen in a room of type %s", (type) => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup({ type });
    expect(speaking.say(ROOM, said("hi"))).toBe(true);
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :hi`]);
  });

  it("is read back as the line's country: what goes out is what the room reads", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup();
    speaking.say(ROOM, said("hi"));
    expect(lineOf(relayed(sent[0] ?? ""), ROOM)).toMatchObject({ country: "JP" });
  });

  it.each(["accounts", "members", "members-write"] as const)(
    "carries none in a room of type %s: not everyone may read it, and what it says stays there",
    (type) => {
      keepCountry(ME, "JP");
      const { sent, speaking } = setup({ type });
      expect(speaking.say(ROOM, said("hi"))).toBe(true);
      expect(sent).toEqual([`PRIVMSG ${ROOM} :hi`]);
    },
  );

  it("carries none while the list of rooms is not known: what is not known to be public is not", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup({ type: null });
    expect(speaking.say(ROOM, said("hi"))).toBe(true);
    expect(sent).toEqual([`PRIVMSG ${ROOM} :hi`]);
  });

  it("carries none in a room the list does not hold", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup({ listed: "#garden" });
    expect(speaking.say(ROOM, said("hi"))).toBe(true);
    expect(sent).toEqual([`PRIVMSG ${ROOM} :hi`]);
  });

  it("reads the list at each line: a room that stops being public stops carrying it", () => {
    keepCountry(ME, "JP");
    const { sent, speaking, list } = setup();
    speaking.say(ROOM, said("one"));
    list("members");
    speaking.say(ROOM, said("two"));
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :one`, `PRIVMSG ${ROOM} :two`]);
  });

  // The list is what the page asked as it opened; the reconciler moves a room's modes every 60 s (docs/decisions.md, 3m): +R is an account's
  // room, +i a member's. An open tab hears them, and no new list comes.
  it.each(["+i", "+R", "+Mi", "+MR", "+m+i", "+b-m+i", "-m+R"])(
    "carries none once the room is heard closing, by %s, while the list still says open",
    (flags) => {
      keepCountry(ME, "JP");
      const { sent, speaking, heard } = setup();
      speaking.say(ROOM, said("one"));
      heard(`:gnoworld!bot@h MODE ${ROOM} ${flags}`);
      speaking.say(ROOM, said("two"));
      expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :one`, `PRIVMSG ${ROOM} :two`]);
    },
  );

  it.each([
    ["a voice", "+v g1abci"],
    ["a mute's mask", "+b m:g1abcR"],
    ["a moderated room", "+m"],
    ["a room opening", "-i"],
    ["a room's flags taken back", "-iR+m"],
  ])("carries it on through %s: a mode that closes nothing", (_, flags) => {
    keepCountry(ME, "JP");
    const { sent, speaking, heard } = setup();
    heard(`:gnoworld!bot@h MODE ${ROOM} ${flags}`);
    speaking.say(ROOM, said("hi"));
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :hi`]);
  });

  it("carries it on when another room closes, or an account's own modes change", () => {
    keepCountry(ME, "JP");
    const { sent, speaking, heard } = setup();
    heard(":gnoworld!bot@h MODE #garden +i");
    heard(`:${ME}!u@h MODE ${ME} +R`);
    speaking.say(ROOM, said("hi"));
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :hi`]);
  });

  it("carries none once the list is gone: a list that failed says nothing of a room", () => {
    keepCountry(ME, "JP");
    const { sent, speaking, store } = setup();
    store.getState().chatActions.listed(undefined);
    speaking.say(ROOM, said("hi"));
    expect(sent).toEqual([`PRIVMSG ${ROOM} :hi`]);
  });

  it.each([
    ["open", "members"],
    ["members", "open"],
  ] as const)("carries none in a room listed twice, as %s and as %s: one no says no", (first, second) => {
    keepCountry(ME, "JP");
    const { sent, speaking, list } = setup();
    list(first, second);
    speaking.say(ROOM, said("hi"));
    expect(sent).toEqual([`PRIVMSG ${ROOM} :hi`]);
  });

  it("carries it in a room listed twice, public both times", () => {
    keepCountry(ME, "JP");
    const { sent, speaking, list } = setup();
    list("open", "announcement");
    speaking.say(ROOM, said("hi"));
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :hi`]);
  });

  it("shows the time zone's country by default (D395): the tag rides on a public room's line, and the device keeps nothing", () => {
    const { sent, speaking } = setup();
    speaking.say(ROOM, said("hi"));
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :hi`]);
    expect(localStorage.length).toBe(0);
  });

  it("reads the account of the moment: another on this device shows its own, not the last one's choice", () => {
    keepCountry(ME, "FR");
    const { sent, speaking, login } = setup();
    login(OTHER);
    speaking.say(ROOM, said("hi"));
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :hi`]);
  });

  it("goes untagged in a private room by default too: the time zone's country is never said there", () => {
    const { sent, speaking } = setup({ type: "members" });
    speaking.say(ROOM, said("hi"));
    expect(sent).toEqual([`PRIVMSG ${ROOM} :hi`]);
  });

  it("sends nothing for a guest, and reads nothing of the device for one", () => {
    keepCountry(ME, "JP");
    const { sent, speaking, login } = setup();
    login("guest");
    const read = vi.spyOn(Storage.prototype, "getItem");
    expect(speaking.say(ROOM, said("hi"))).toBe(false);
    expect(sent).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("carries it beside a reply's tag", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup();
    speaking.say(ROOM, said("hi"), "m1");
    expect(sent).toEqual([`@+reply=m1;+gnoworld/country=JP PRIVMSG ${ROOM} :hi`]);
  });

  it("carries none on a correction: the line it corrects said it, and a correction is no new line", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup();
    speaking.correct(ROOM, said("fixed"), "m1");
    expect(sent).toEqual([`@+gnoworld/edit=m1 PRIVMSG ${ROOM} :fixed`]);
  });

  it("carries it once on a message of several lines, on the batch that opens it", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup();
    speaking.say(ROOM, said("one\ntwo"));
    expect(sent.filter((line) => line.includes("gnoworld/country"))).toEqual([
      expect.stringMatching(/^@\+gnoworld\/country=JP BATCH \+\w+ draft\/multiline #earth$/),
    ]);
  });

  it("carries it on the first line alone when Ergo takes a line at a time: one message, one country", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup({ multiline: false });
    speaking.say(ROOM, said("one\ntwo"));
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :one`, `PRIVMSG ${ROOM} :two`]);
  });

  it("carries none on a direct message: nothing of ours declares a country there", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup();
    speaking.sayTo(OTHER, { composed: compose(OTHER, "hi", ME), draft: "hi" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("country");
  });

  it("carries none on a reaction", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup();
    speaking.react(ROOM, { on: true, emoji: "👍", to: "m1" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("country");
  });

  it("reads the choice at each line: taken back, the next line says nothing", () => {
    keepCountry(ME, "JP");
    const { sent, speaking } = setup();
    speaking.say(ROOM, said("one"));
    keepCountry(ME, undefined);
    speaking.say(ROOM, said("two"));
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :one`, `PRIVMSG ${ROOM} :two`]);
  });

  it("goes with the time zone's country alone when the device holds no country: nothing it holds opens a tag of its own", () => {
    localStorage.setItem(`gnoworld:country:${ME}`, '"JP;+gnoworld/edit=m1"');
    const { sent, speaking } = setup();
    expect(speaking.say(ROOM, said("hi"))).toBe(true);
    expect(sent).toEqual([`@+gnoworld/country=JP PRIVMSG ${ROOM} :hi`]);
  });

  // The device cannot be read, so a hiding it kept cannot be either: the time zone's country is shown (it could not be kept to begin with).
  it("carries no country when the device cannot be reached: a hidden one it cannot see stays hidden (Alexis, 2026-11-10)", () => {
    keepCountry(ME, "JP");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { sent, speaking } = setup();
    expect(speaking.say(ROOM, said("hi"))).toBe(true);
    expect(sent).toEqual([`PRIVMSG ${ROOM} :hi`]);
  });
});
