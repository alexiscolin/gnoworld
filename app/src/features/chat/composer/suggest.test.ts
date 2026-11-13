import { describe, expect, it } from "vitest";
import { suggestions } from "./suggest.ts";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const CHOICES = {
  commands: ["/me", "/poll"],
  rooms: ["#games", "#gnogolf", "#news"],
  people: [ALICE, BOB],
  group: true,
  names: new Map([[ALICE, "alice"]]),
};
const values = (draft: string, over = {}) => suggestions(draft, { ...CHOICES, ...over }).map((item) => item.value);

describe("the composer's suggestions", () => {
  it("lists the commands at the field's start, each with its use, narrowed as letters follow", () => {
    expect(suggestions("/", CHOICES)).toEqual([
      { value: "/me", label: "/me", hint: "Send an action: /me waves" },
      { value: "/poll", label: "/poll", hint: "Ask a poll: /poll Question? | answer | answer" },
    ]);
    expect(values("/p")).toEqual(["/poll"]);
    expect(values("  /m")).toEqual(["/me"]);
  });

  it("lists no command once the command is typed whole, nor after other words", () => {
    expect(values("/me")).toEqual([]);
    expect(values("hello /m")).toEqual([]);
    expect(values("/x")).toEqual([]);
  });

  it("lists the rooms after #, narrowed", () => {
    expect(values("#")).toEqual(["#games", "#gnogolf", "#news"]);
    expect(values("see #g")).toEqual(["#games", "#gnogolf"]);
    expect(values("see #gno")).toEqual(["#gnogolf"]);
  });

  it("lists the members after @, a name when they have one, else the short address", () => {
    expect(suggestions("@", CHOICES)).toEqual([
      { value: `@${ALICE}`, label: "alice", hint: "g10gh7…3y5tv" },
      { value: `@${BOB}`, label: "g1jg8m…vsqf5" },
    ]);
  });

  it("narrows the members by what is typed of the name or of the address", () => {
    expect(values("hi @al")).toEqual([`@${ALICE}`]);
    expect(values("hi @g1jg")).toEqual([`@${BOB}`]);
    expect(values("hi @zz")).toEqual([]);
  });

  it("offers @room first after a letter, in a room that has one, none otherwise", () => {
    expect(values("@r")).toEqual(["@room"]);
    expect(values("@r", { group: false })).toEqual([]);
    expect(values("@")).not.toContain("@room");
  });

  it("lists nothing inside a word, in the middle of a code span, or for a word with no mark", () => {
    expect(values("mail@al")).toEqual([]);
    expect(values("`@al")).toEqual([]);
    expect(values("word")).toEqual([]);
    expect(values("")).toEqual([]);
  });

  it("lists five at most", () => {
    const rooms = Array.from({ length: 9 }, (_, n) => `#room${String(n)}`);
    expect(values("#", { rooms })).toHaveLength(5);
  });
});

describe("the examples after @jarvis ", () => {
  const choices = { commands: [], rooms: [], people: [], jarvis: true, examples: ["what is a realm?", "who is here?"] };
  const picks = (draft: string, over = {}) => suggestions(draft, { ...choices, ...over }).map((item) => item.value);

  it("offer each example as the draft it becomes, narrowed by the words typed, once the mention and its space are there", () => {
    expect(picks("@jarvis ")).toEqual(["@jarvis what is a realm?", "@jarvis who is here?"]);
    expect(picks("@jarvis wh")).toEqual(["@jarvis what is a realm?", "@jarvis who is here?"]);
    expect(picks("@jarvis WHO")).toEqual(["@jarvis who is here?"]);
    expect(suggestions("@jarvis ", choices)[0]).toEqual({
      value: "@jarvis what is a realm?",
      label: "what is a realm?",
    });
  });

  it("offer none for another start, for words that match none, for a whole example, or where Jarvis cannot answer", () => {
    expect(picks("@jarvis")).toEqual([]);
    expect(picks("hi @jarvis ")).toEqual([]);
    expect(picks("@jarvis zzz")).toEqual([]);
    expect(picks("@jarvis who is here?")).toEqual([]);
    expect(picks("@jarvis ", { examples: [] })).toEqual([]);
    expect(picks("@jarvis ", { examples: undefined })).toEqual([]);
  });
});
