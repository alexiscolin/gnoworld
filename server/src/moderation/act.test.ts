import { describe, expect, it } from "vitest";
import { act, REASON_WORDS } from "./act.ts";
import { CATEGORIES } from "./provider.ts";

const SAID = {
  room: "#bubble",
  account: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
  msgid: "m1",
  text: "you are all idiots",
};

const run = (verdict: Parameters<typeof act>[1], sends: (command: string) => boolean = () => true) => {
  const sent: [string, string[]][] = [];
  const done = act(SAID, verdict, {
    send: (command, params) => {
      sent.push([command, [...params]]);
      return sends(command);
    },
  });
  return { sent, done };
};

// Written out here, not read from the code: each reason's words as its author reads them.
const WORDS: Record<string, string> = {
  harassment: "harassment",
  "harassment/threatening": "threats",
  hate: "hate",
  "hate/threatening": "threats of hate",
  illicit: "advice on wrongdoing",
  "illicit/violent": "advice on violence",
  "self-harm": "self harm",
  "self-harm/instructions": "advice on self harm",
  "self-harm/intent": "self harm",
  sexual: "sexual content",
  "sexual/minors": "sexual content involving minors",
  violence: "violence",
  "violence/graphic": "graphic violence",
  banned_word: "a word this world bans",
  links: "too many links",
  mentions: "too many mentions",
  new_account_links: "too many links for a new account",
  too_fast: "too many messages too fast",
  not_their_edit: "an edit of a message that is not yours",
};

describe("acting on a verdict", () => {
  it("hides a flagged line by the id just scored, and tells its author why, with the rules", () => {
    expect(run({ action: "hide", reason: "harassment" })).toEqual({
      done: true,
      sent: [
        ["REDACT", ["#bubble", "m1", "harassment"]],
        [
          "NOTICE",
          [SAID.account, "Your message in #bubble was hidden: harassment. The rules: https://gno.world/rules"],
        ],
      ],
    });
  });

  it.each([[{ action: "pass" } as const], [{ action: "unchecked" } as const]])(
    "does nothing on %j, and is done",
    (verdict) => {
      expect(run(verdict)).toEqual({ done: true, sent: [] });
    },
  );

  it("is not done when the REDACT is not sent, and tells nobody", () => {
    expect(run({ action: "hide", reason: "violence" }, () => false)).toEqual({
      done: false,
      sent: [["REDACT", ["#bubble", "m1", "violence"]]],
    });
  });

  it("is done once the REDACT is sent, the NOTICE being the author's courtesy", () => {
    expect(run({ action: "hide", reason: "violence" }, (command) => command === "REDACT").done).toBe(true);
  });

  it("writes every reason in its own words, never from the message or the answer", () => {
    const reasons = [
      ...CATEGORIES,
      "banned_word",
      "links",
      "mentions",
      "new_account_links",
      "too_fast",
      "not_their_edit",
    ] as const;
    expect(Object.keys(REASON_WORDS).toSorted()).toEqual(Object.keys(WORDS).toSorted());
    for (const reason of reasons) {
      const { sent } = run({ action: "hide", reason });
      expect(sent[0]?.[1][2]).toBe(WORDS[reason]);
      expect(sent[1]?.[1][1]).toBe(
        `Your message in #bubble was hidden: ${WORDS[reason] ?? ""}. The rules: https://gno.world/rules`,
      );
      expect(JSON.stringify(sent)).not.toContain("idiots");
    }
  });
});
