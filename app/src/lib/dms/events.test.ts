import { parseLine, type IrcMessage } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { withOf } from "./events.ts";

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

  it("is none while my nick is unknown or no address", () => {
    expect(withOf(tagmsg(ALICE, ME), "")).toBeUndefined();
    expect(withOf(tagmsg("guest-ab12cd", "guest-zzzzzz"), "guest-zzzzzz")).toBeUndefined();
  });
});
