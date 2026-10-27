import { parseLine, type IrcMessage, type Line } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { afterAct, keptWith, withOf, type Held } from "./events.ts";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const CAROL = "g1pery0j3xzn6wm5m3w8sxkmyafmnd6cle4s3er";
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
const tagmsg = (from: string, to: string) =>
  read(`@msgid=t;account=${from};+draft/react=👍;+reply=m1 :${from}!u@h TAGMSG ${to}`);
const redact = (from: string, to: string) => read(`@msgid=r;account=${from} :${from}!u@h REDACT ${to} m1`);

// 4d-dm-bar: a direct message's reactions and deletes are TAGMSGs and REDACTs to a nick, which dmOf (lines alone)
// does not read; Ergo names the target as the sender wrote it, so each side sees its own nick or its partner's.
describe("withOf: the conversation a reaction or a delete belongs to", () => {
  it.each([
    ["a reaction to me", tagmsg(ALICE, ME), ALICE],
    ["my reaction, as Ergo echoes it", tagmsg(ME, ALICE), ALICE],
    ["a delete of the partner's line, to me", redact(ALICE, ME), ALICE],
    ["my delete, as Ergo echoes it", redact(ME, ALICE), ALICE],
  ])("is the other account of %s", (_, message, partner) => {
    expect(withOf(message, ME)).toBe(partner);
  });

  it.each([
    ["a room's reaction", tagmsg(ALICE, "#bubble/games")],
    ["a room's delete", redact(ALICE, "#bubble/games")],
    ["one between two others", tagmsg(ALICE, CAROL)],
    ["one to oneself", tagmsg(ME, ME)],
    ["a guest's reaction", read(`@msgid=t;+draft/react=👍;+reply=m1 :guest-ab12cd!u@h TAGMSG ${ME}`)],
    ["a PRIVMSG, which dmOf reads", read(`@msgid=p;account=${ALICE} :${ALICE}!u@h PRIVMSG ${ME} :hi`)],
  ])("is none for %s", (_, message) => {
    expect(withOf(message, ME)).toBeUndefined();
  });

  // /code-review on 4d's DM bar (CR8): dmOf folds the case of my nick, withOf did not, so a partner writing it in capitals
  // had its line taken and its reaction and delete dropped, its own delete staying on my screen.
  it.each([
    ["a reaction", tagmsg(ALICE, ME.toUpperCase())],
    ["a delete", redact(ALICE, ME.toUpperCase())],
  ])("takes %s to my nick in capitals, as Ergo folds it", (_, message) => {
    expect(withOf(message, ME)).toBe(ALICE);
  });

  it("takes my own echo whatever the case of the nick it names me by", () => {
    expect(
      withOf(read(`@msgid=t;account=${ME};+draft/react=👍;+reply=m1 :${ME.toUpperCase()}!u@h TAGMSG ${ALICE}`), ME),
    ).toBe(ALICE);
  });

  it("is none while my nick is unknown or no address", () => {
    expect(withOf(tagmsg(ALICE, ME), "")).toBeUndefined();
    expect(withOf(tagmsg("guest-ab12cd", "guest-zzzzzz"), "guest-zzzzzz")).toBeUndefined();
  });
});

describe("keptWith: the reactions of the conversations still held", () => {
  it("is the same object while every conversation with reactions is held, so no one is told", () => {
    const reactions = { [ALICE]: [1], [CAROL]: [2] };
    expect(keptWith(reactions, { [ALICE]: [], [CAROL]: [], [ME]: [] })).toBe(reactions);
  });

  it("leaves out the conversations no longer held, and keeps the others' own", () => {
    const kept = [2];
    expect(keptWith({ [ALICE]: [1], [CAROL]: kept }, { [CAROL]: [] })).toEqual({ [CAROL]: kept });
  });
});

const lineOf = (id: string, from: string, edits?: string): Line => ({
  id,
  time: `2026-10-25T10:00:0${id.slice(1)}.000Z`,
  from,
  account: from,
  text: `text ${id}`,
  kind: "message",
  ...(edits === undefined ? {} : { edits }),
});
const act = (held: Held, message: IrcMessage) => afterAct(held, message, 1000);

// /code-review on 4d's DM bar (CR3): a REDACT names one line; the corrections of it a partner's client did not send its
// own REDACT for (refused, flood-limited, past the outbox's window) showed, as plain lines, the words just deleted.
describe("afterAct: a delete takes the corrections of the line with it", () => {
  const redactOf = (from: string, id: string) => read(`@msgid=r;account=${from} :${from}!u@h REDACT ${ME} ${id}`);

  it("takes the corrections of the sender's own, with the line", () => {
    const held = { lines: [lineOf("m1", ALICE), lineOf("m2", ALICE, "m1"), lineOf("m3", ME)], reactions: undefined };
    expect(act(held, redactOf(ALICE, "m1")).lines.map((line) => line.id)).toEqual(["m3"]);
  });

  it("takes them though the line itself left the window long ago", () => {
    const held = { lines: [lineOf("m2", ALICE, "m1"), lineOf("m3", ME)], reactions: undefined };
    expect(act(held, redactOf(ALICE, "m1")).lines.map((line) => line.id)).toEqual(["m3"]);
  });

  it("leaves a correction of the line by another account, which is a line of its own", () => {
    const held = { lines: [lineOf("m1", ALICE), lineOf("m2", ME, "m1")], reactions: undefined };
    expect(act(held, redactOf(ALICE, "m1")).lines.map((line) => line.id)).toEqual(["m2"]);
  });

  it("changes nothing when the line is another's, whose delete Ergo refuses, nor its corrections", () => {
    const held = { lines: [lineOf("m1", ME), lineOf("m2", ALICE, "m1")], reactions: undefined };
    expect(act(held, redactOf(ALICE, "m1"))).toBe(held);
  });

  it("is the same object when the delete names no line and no correction", () => {
    const held = { lines: [lineOf("m1", ME)], reactions: undefined };
    expect(act(held, redactOf(ALICE, "m9"))).toBe(held);
  });
});

// /code-review on 4d's DM bar (complexity): a typing TAGMSG, every 3 s from a partner, reads no line and no reaction.
describe("afterAct: a TAGMSG with no reaction", () => {
  it("is the same object, its lines and reactions never read", () => {
    const lines = [lineOf("m1", ME)];
    const reactions: never[] = [];
    const reading = () => {
      throw new Error("read");
    };
    for (const key of ["some", "filter", "map", "find"] as const) {
      Object.defineProperty(lines, key, { get: reading });
      Object.defineProperty(reactions, key, { get: reading });
    }
    const held = { lines, reactions };
    const typing = read(`@msgid=t;account=${ALICE};+typing=active :${ALICE}!u@h TAGMSG ${ME}`);
    expect(act(held, typing)).toBe(held);
  });
});
