import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compose, MULTILINE_BYTES } from "@gnoworld/core";
import { DRAFT_LIMIT, drafts } from "./drafts.ts";

const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");

// A device's storage, as the page's localStorage behaves: strings by key, any of its calls refused when it is.
function storage({ refuses = false } = {}) {
  const kept = new Map<string, string>();
  const refuse = () => {
    if (refuses) throw new DOMException("The storage is blocked.", "SecurityError");
  };
  return {
    kept,
    getItem: (key: string) => {
      refuse();
      return kept.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      refuse();
      kept.set(key, value);
    },
    removeItem: (key: string) => {
      refuse();
      kept.delete(key);
    },
  };
}
const on = (device: ReturnType<typeof storage>, account: Address) => drafts(() => device, account);

describe("an account's drafts on the device", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a draft for its room, as typed, and gives nothing for a room with none", () => {
    const device = storage();
    const mine = on(device, ALICE);
    expect(mine.set("#bubble/games", "see you **tonight** ")).toBe(true);
    expect(mine.get("#bubble/games")).toBe("see you **tonight** ");
    expect(mine.get("#bubble")).toBe("");
    expect(on(device, ALICE).get("#bubble/games")).toBe("see you **tonight** ");
  });

  it("keeps each account's and each room's apart: one never reads another's", () => {
    const device = storage();
    on(device, ALICE).set("#bubble", "alice's");
    expect(on(device, BOB).get("#bubble")).toBe("");
    on(device, BOB).set("#bubble", "bob's");
    on(device, ALICE).set("#bubble/games", "another room");
    expect(on(device, ALICE).get("#bubble")).toBe("alice's");
    expect(on(device, BOB).get("#bubble")).toBe("bob's");
    expect(on(device, BOB).get("#bubble/games")).toBe("");
  });

  it("forgets a draft made blank, keeping no key for it, and writes none for nothing", () => {
    const device = storage();
    const mine = on(device, ALICE);
    expect(mine.set("#bubble", "")).toBe(true);
    expect(device.kept.size).toBe(0);
    mine.set("#bubble", "half a thought");
    expect(mine.set("#bubble", "   ")).toBe(true);
    expect(mine.get("#bubble")).toBe("");
    expect(device.kept.size).toBe(0);
  });

  it(`keeps a draft of ${String(DRAFT_LIMIT)} UTF-16 units at most; a longer one forgets the last, no older text to come back`, () => {
    // A message of several lines goes at 4096 bytes: no draft the composer lets go is lost (the red pass's R12).
    expect(DRAFT_LIMIT).toBe(MULTILINE_BYTES);
    const device = storage();
    const mine = on(device, ALICE);
    expect(mine.set("#bubble", "😀".repeat(DRAFT_LIMIT / 2))).toBe(true);
    expect(mine.get("#bubble")).toBe("😀".repeat(DRAFT_LIMIT / 2));
    // Zod counts a string in code points, so only a line of one-unit characters reads back at the limit's edge.
    expect(mine.set("#bubble", "x".repeat(DRAFT_LIMIT))).toBe(true);
    expect(mine.get("#bubble")).toBe("x".repeat(DRAFT_LIMIT));
    expect(mine.set("#bubble", "😀".repeat(DRAFT_LIMIT / 2 + 1))).toBe(false);
    expect(mine.get("#bubble")).toBe("");
    expect(device.kept.size).toBe(0);
  });

  // G7 of the green pass: compose trims each line's end, so a draft whose trailing spaces alone pass the limit is still
  // one the composer lets go; it is kept as compose reads it.
  it("keeps a draft the composer lets go though its trailing spaces pass the limit, as compose reads it", () => {
    const nick = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    const text = `${"a".repeat(50)} ${"a".repeat(49)}`;
    const draft = Array.from({ length: 38 }, () => `${text}${" ".repeat(110)}`).join("\n");
    expect(draft.length).toBeGreaterThan(DRAFT_LIMIT);
    expect(compose("#bubble", draft, nick).kind).toBe("lines");
    const mine = on(storage(), ALICE);
    expect(mine.set("#bubble", "an older one")).toBe(true);
    expect(mine.set("#bubble", draft)).toBe(true);
    // The spaces inside a line stay: only those at its end were no text.
    expect(mine.get("#bubble")).toBe(Array.from({ length: 38 }, () => text).join("\n"));
  });

  // F1716 (CR4): compose trims each line's end as JavaScript's trimEnd does, so a no-break space and an ideographic
  // space at a line's end were no text either.
  it("keeps a draft the composer lets go though the ends of its lines are no-break or ideographic spaces", () => {
    const nick = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    const draft = Array.from({ length: 38 }, (_, at) =>
      `line ${String(at)}${at % 2 === 0 ? "\u3000" : "\u00a0"}`.padEnd(110, at % 2 === 0 ? "\u3000" : "\u00a0"),
    ).join("\n");
    expect(draft.length).toBeGreaterThan(DRAFT_LIMIT);
    expect(compose("#bubble", draft, nick).kind).toBe("lines");
    const mine = on(storage(), ALICE);
    expect(mine.set("#bubble", draft)).toBe(true);
    expect(mine.get("#bubble")).toBe(Array.from({ length: 38 }, (_, at) => `line ${String(at)}`).join("\n"));
  });

  // F1711 (S2): a run of spaces inside a line cost the square of its length each time the draft changed (20,000 spaces
  // 2.9 s, 40,000 5 s); the draft is read once, a line at a time.
  it("trims a draft of a long run of spaces inside a line at once, not by the square of its length", () => {
    const mine = on(storage(), ALICE);
    const draft = `a${" ".repeat(60_000)}b`;
    // Structural, not timed (R4): the square came from a regex replace over the run, so none may be called.
    const replace = vi.spyOn(String.prototype, "replace");
    const replaceAll = vi.spyOn(String.prototype, "replaceAll");
    expect(mine.set("#bubble", draft)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(replaceAll).not.toHaveBeenCalled();
  });

  // Survivor of StrykerJS: a lone CR is a break to compose, so the spaces before it are a line's end too.
  it("trims the end of a line a lone CR or a CR LF ends, as compose does", () => {
    const nick = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    for (const lineBreak of ["\r", "\r\n"]) {
      const draft = Array.from({ length: 38 }, (_, at) => `line ${String(at)}${" ".repeat(110)}`).join(lineBreak);
      expect(draft.length).toBeGreaterThan(DRAFT_LIMIT);
      expect(compose("#bubble", draft, nick).kind).toBe("lines");
      const mine = on(storage(), ALICE);
      expect(mine.set("#bubble", draft)).toBe(true);
      expect(mine.get("#bubble")).toBe(Array.from({ length: 38 }, (_, at) => `line ${String(at)}`).join("\n"));
    }
  });

  it("keeps a draft of exactly the limit as typed, its trailing space too: only a longer one is trimmed", () => {
    const mine = on(storage(), ALICE);
    const draft = `${"a".repeat(DRAFT_LIMIT - 1)} `;
    expect(mine.set("#bubble", draft)).toBe(true);
    expect(mine.get("#bubble")).toBe(draft);
  });

  it("keeps a draft of blank lines and tabs only as none, kept or not: nothing to come back", () => {
    const mine = on(storage(), ALICE);
    mine.set("#bubble", "an older one");
    expect(mine.set("#bubble", `${" ".repeat(DRAFT_LIMIT)}\n\t${"\r\n".repeat(DRAFT_LIMIT)}`)).toBe(true);
    expect(mine.get("#bubble")).toBe("");
  });

  it("reads what the device holds as no draft unless it is one: past the limit, it is none", () => {
    const device = storage();
    on(device, ALICE).set("#bubble", "kept");
    const [key = ""] = device.kept.keys();
    device.kept.set(key, "x".repeat(DRAFT_LIMIT + 1));
    expect(on(device, ALICE).get("#bubble")).toBe("");
    expect(device.kept.size).toBe(0);
  });

  it("says a draft was not kept when the device refuses it, reads none, and throws nothing", () => {
    const mine = on(storage({ refuses: true }), ALICE);
    expect(mine.set("#bubble", "a draft")).toBe(false);
    expect(mine.set("#bubble", "  ")).toBe(false);
    expect(mine.get("#bubble")).toBe("");
  });

  it("reads none and keeps none when the device's storage cannot even be reached", () => {
    const blocked = drafts(() => {
      throw new DOMException("The storage is blocked.", "SecurityError");
    }, ALICE);
    expect(blocked.get("#bubble")).toBe("");
    expect(blocked.set("#bubble", "a draft")).toBe(false);
  });

  it("keeps a draft under a key of its own account and room, which another's cannot reach", () => {
    const device = storage();
    on(device, ALICE).set("#bubble/games", "x");
    expect([...device.kept.keys()]).toEqual([`gnoworld:draft:${ALICE}:#bubble/games`]);
  });
});
