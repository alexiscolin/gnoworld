import { toIrcCommand, type IrcMessage } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { AROUND_LINES, Jumps, aroundCommand, readingWords } from "./jump.ts";

// Opening a room at a found message: CHATHISTORY AROUND, which Ergo v2.19.1 serves (irc/handlers.go:935, the server's irc/fetch.ts uses
// it). A hit's msgid comes from the server's index, never from Ergo: it is checked again before it goes into a command.
const privmsg = (msgid: string): IrcMessage => ({
  tags: new Map([["msgid", msgid]]),
  command: toIrcCommand("PRIVMSG") ?? ("" as IrcMessage["command"]),
  params: ["#bubble/games", "hi"],
});

describe("the command that asks the window around a message", () => {
  it("is AROUND with the msgid and the window's size", () => {
    expect(aroundCommand("#bubble/games", "abc123")).toBe(
      `CHATHISTORY AROUND #bubble/games msgid=abc123 ${String(AROUND_LINES)}`,
    );
  });

  it.each([
    ["a space, which would end the argument", "a b"],
    ["a comma", "a,b"],
    ["a newline, which would start a second command", "a\r\nQUIT"],
    ["a NUL", "a\0b"],
    ["a leading colon", ":abc"],
    ["nothing", ""],
    ["65 characters", "x".repeat(65)],
  ])("is none for a msgid with %s", (_name, msgid) => {
    expect(aroundCommand("#bubble/games", msgid)).toBeUndefined();
  });

  it("is none for a room that is no room", () => {
    expect(aroundCommand("#bubble games", "abc")).toBeUndefined();
    expect(aroundCommand("#bubble/games\r\nQUIT", "abc")).toBeUndefined();
    expect(aroundCommand("bubble", "abc")).toBeUndefined();
  });
});

describe("the jump waiting for Ergo's answer", () => {
  it("gives the command to send and waits for the page that holds the message", () => {
    const jumps = new Jumps();
    expect(jumps.ask("#bubble/games", "abc")).toContain("msgid=abc");
    expect(jumps.answer("#bubble/games", [privmsg("x"), privmsg("y")])).toBeUndefined();
    expect(jumps.answer("#bubble/games", [privmsg("x"), privmsg("abc")])).toBe("abc");
  });

  it("is done once answered: the next page is an ordinary one", () => {
    const jumps = new Jumps();
    jumps.ask("#bubble/games", "abc");
    jumps.answer("#bubble/games", [privmsg("abc")]);
    expect(jumps.answer("#bubble/games", [privmsg("abc")])).toBeUndefined();
  });

  it("answers for its room alone", () => {
    const jumps = new Jumps();
    jumps.ask("#bubble/games", "abc");
    expect(jumps.answer("#bubble/dev", [privmsg("abc")])).toBeUndefined();
  });

  it("asks nothing and waits for nothing for a msgid that is refused", () => {
    const jumps = new Jumps();
    expect(jumps.ask("#bubble/games", "a b")).toBeUndefined();
    expect(jumps.answer("#bubble/games", [privmsg("a b")])).toBeUndefined();
  });

  it("forgets the last jump when a new one is asked, and when cancelled", () => {
    const jumps = new Jumps();
    jumps.ask("#bubble/games", "abc");
    jumps.ask("#bubble/games", "def");
    expect(jumps.answer("#bubble/games", [privmsg("abc")])).toBeUndefined();
    expect(jumps.answer("#bubble/games", [privmsg("def")])).toBe("def");
    jumps.ask("#bubble/games", "ghi");
    jumps.cancel();
    expect(jumps.answer("#bubble/games", [privmsg("ghi")])).toBeUndefined();
  });
});

describe("what the room says while it is read around a message", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  it("names the day, with no year this year", () => {
    expect(readingWords("2026-11-04T14:05:00Z", now, { timeZone: "UTC", locale: "en-US" })).toBe(
      "You are reading Nov 4, around a found message.",
    );
  });

  it("names the year when it is not this year's", () => {
    expect(readingWords("2025-03-02T14:05:00Z", now, { timeZone: "UTC", locale: "en-US" })).toBe(
      "You are reading Mar 2, 2025, around a found message.",
    );
  });

  it("says no day for a time that is none", () => {
    expect(readingWords("yesterday-ish", now)).toBe("You are reading around a found message.");
  });
});
