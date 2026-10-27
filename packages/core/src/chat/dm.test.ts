import { describe, expect, test } from "vitest";
import { parseLine, type IrcMessage } from "../irc/irc.ts";
import { dmOf } from "./dm.ts";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const T0 = "2026-10-25T10:00:00.000Z";
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
const tags = (id: string, account?: string) =>
  `@msgid=${id};time=${T0}${account === undefined ? "" : `;account=${account}`}`;

// 4e (docs/plans/slice-4.md §7): a direct message is a PRIVMSG or a NOTICE to a nick, not a room: from an account to
// me, or mine to an account, as Ergo echoes it (echo-message). Its partner keys the conversation.
describe("dmOf: a direct message and who it is with", () => {
  test("reads an account's message to me, with that account as the partner", () => {
    expect(dmOf(read(`${tags("a", ALICE)} :${ALICE}!u@h PRIVMSG ${ME} :hi there`), ME)).toStrictEqual({
      partner: ALICE,
      line: { id: "a", time: T0, from: ALICE, account: ALICE, text: "hi there", kind: "message" },
    });
  });

  test("reads my own message to an account, as Ergo echoes it, with that account as the partner", () => {
    expect(dmOf(read(`${tags("b", ME)} :${ME}!u@h PRIVMSG ${ALICE} :hello`), ME)).toStrictEqual({
      partner: ALICE,
      line: { id: "b", time: T0, from: ME, account: ME, text: "hello", kind: "message" },
    });
  });

  test("reads an /me and a NOTICE as a room's line reads them", () => {
    expect(
      dmOf(read(`${tags("c", ALICE)} :${ALICE}!u@h PRIVMSG ${ME} :\u0001ACTION waves\u0001`), ME)?.line,
    ).toMatchObject({
      kind: "action",
      text: "waves",
    });
    expect(dmOf(read(`${tags("d", ALICE)} :${ALICE}!u@h NOTICE ${ME} :heads up`), ME)?.line.kind).toBe("notice");
  });

  test("reads my nick whatever its case, as Ergo folds it", () => {
    expect(dmOf(read(`${tags("e", ALICE)} :${ALICE}!u@h PRIVMSG ${ME.toUpperCase()} :hi`), ME)?.partner).toBe(ALICE);
  });

  // Guests have no direct messages (the plan's scope): a line with no account tag, a guest's, is none.
  test.each([
    ["a guest's message, with no account tag", `${tags("f")} :guest-ab12cd!u@h PRIVMSG ${ME} :hi`],
    ["a message whose account tag is not its nick's", `${tags("g", ALICE)} :guest-ab12cd!u@h PRIVMSG ${ME} :hi`],
    ["a room's line", `${tags("h", ALICE)} :${ALICE}!u@h PRIVMSG #bubble :hi`],
    ["a message between two others", `${tags("i", ALICE)} :${ALICE}!u@h PRIVMSG someone :hi`],
    ["a message with no id or time", `:${ALICE}!u@h PRIVMSG ${ME} :hi`],
    ["an empty message", `${tags("j", ALICE)} :${ALICE}!u@h PRIVMSG ${ME} :`],
    ["a CTCP other than ACTION", `${tags("k", ALICE)} :${ALICE}!u@h PRIVMSG ${ME} :\u0001VERSION\u0001`],
    ["a TAGMSG", `${tags("l", ALICE)} :${ALICE}!u@h TAGMSG ${ME}`],
    ["a message to me from me", `${tags("m", ME)} :${ME}!u@h PRIVMSG ${ME} :note to self`],
    // StrykerJS on 4e: my own line in a room is the room's, never a direct message to it.
    ["my own message to a room", `${tags("n", ME)} :${ME}!u@h PRIVMSG #bubble :hi all`],
    // 4e's late test audit (T8): Ergo's echo of a line to a room's ranks (STATUSMSG) keeps their prefix.
    ["my own message to a room's operators", `${tags("q", ME)} :${ME}!u@h PRIVMSG @#bubble :ops only`],
    [
      "my own message to a room's ranks, prefixes stacked",
      `${tags("r", ME)} :${ME}!u@h PRIVMSG ~&@%+#bubble :all ranks`,
    ],
    ["a message with no source", `${tags("o", ALICE)} PRIVMSG ${ME} :hi`],
    ["a PRIVMSG with nothing after it", `${tags("p", ALICE)} :${ALICE}!u@h PRIVMSG`],
  ])("reads none of %s", (_, line) => {
    expect(dmOf(read(line), ME)).toBeUndefined();
  });
});
