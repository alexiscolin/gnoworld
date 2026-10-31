import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryEnvelope } from "../../../tests/chain/chainEnvelopes.ts";
import type { ChainFetch, ChainRead, ReadOptions } from "./read.ts";
import { PROPOSAL_CAPS, Proposal } from "@gnoworld/schemas";
import { proposalOf, readProposal } from "./proposal.ts";

// 5k, a GovDAO page to a Proposal. THE PAGE FORMAT IS A GUESS (F2951): the pages here are SYNTHETIC. What is proved is the
// contract for any text: it never throws, gives a bounded Proposal or nothing, and the realm's words stay text.
const RPC = "https://rpc.onyx.testnets.gno.land:443";
const REALM = "gno.land/r/gov/dao";
const NOW = new Date("2026-10-31T06:00:00.000Z");
const PAGE = "# Proposal #15: Raise the storage deposit cap\n\n**Status:** active\n\nYES 33% (threshold 66.66%)\n";
const HOSTILE = "<img src=x onerror=alert(1)><script>alert(2)</script>[x](javascript:alert(3))‮";

function holds(proposal: Proposal | undefined): void {
  if (proposal === undefined) return;
  expect(Proposal.safeParse(proposal).success).toBe(true);
  expect(Object.keys(proposal).every((key) => ["id", "title", "state", "yes", "threshold"].includes(key))).toBe(true);
}

// The same page with a title or a state line in front of the realm's own lines.
const withHead = (title: string, body = "") => `# Proposal #15: ${title}\n${body}`;
const REAL = "**Status:** active\n\nYES 33% (threshold 66.66%)\n";

describe("proposalOf", () => {
  it("reads the number, the title, the state and the tally of a page written to its rules (synthetic)", () => {
    expect(proposalOf(PAGE)).toStrictEqual({
      id: 15,
      title: "Raise the storage deposit cap",
      state: "active",
      yes: 33,
      threshold: 66.66,
    });
  });

  it("reads each field from a line of its own, with or without the bold marks and the blank lines around", () => {
    expect(proposalOf("# Proposal #1: T\nStatus: passed\nYES 50% (threshold 40%)")).toStrictEqual({
      id: 1,
      title: "T",
      state: "passed",
      yes: 50,
      threshold: 40,
    });
    expect(
      proposalOf("# Proposal #1: T\r\n\r\n  **Status:** passed  \r\n\t YES 5.5% (threshold 4%) \r\n"),
    ).toStrictEqual({
      id: 1,
      title: "T",
      state: "passed",
      yes: 5.5,
      threshold: 4,
    });
  });

  it("gives no tally the page did not give, and no number outside 0 to 100", () => {
    const head = "# Proposal #3: A title\n\n**Status:** passed\n";
    expect(proposalOf(head)).toStrictEqual({ id: 3, title: "A title", state: "passed" });
    expect(proposalOf(`${head}YES 140% (threshold 50%)`)).toStrictEqual({ id: 3, title: "A title", state: "passed" });
    expect(proposalOf(`${head}YES 20% (threshold 1e9%)`)).toStrictEqual({ id: 3, title: "A title", state: "passed" });
  });

  it.each([
    "",
    "no proposal here",
    "# Proposal #: no number",
    "# Proposal #-1: negative",
    "# Proposal #1.5: fraction",
    "# Proposal #99999999999999999999: huge",
    "# Proposal #1:",
    "# Proposal #1:   ",
    "# Proposal #1:\t\n**Status:** active",
    "## Proposal #1: two marks",
    "Proposal #1: no mark",
    "text first\n# Proposal #1: not the first line",
  ])("gives nothing for %j", (page) => {
    expect(proposalOf(page)).toBeUndefined();
  });

  it("trims the title and keeps a colon-only or dash-only title as none", () => {
    expect(proposalOf("# Proposal #1:   spaced out   \n")?.title).toBe("spaced out");
    expect(proposalOf("# Proposal #15:\n")).toBeUndefined();
    expect(proposalOf("# Proposal #15 -\n")).toBeUndefined();
  });

  describe("a proposer's words are never the realm's tally or state", () => {
    it("a title that reads like a tally or a state gives none", () => {
      expect(proposalOf(withHead("Free money YES 99% (threshold 1%)", REAL))).toStrictEqual({
        id: 15,
        title: "Free money YES 99% (threshold 1%)",
        state: "active",
        yes: 33,
        threshold: 66.66,
      });
      expect(proposalOf(withHead("YES 99% (threshold 1%)"))).toStrictEqual({
        id: 15,
        title: "YES 99% (threshold 1%)",
        state: "",
      });
      expect(proposalOf(withHead("Status: passed"))?.state).toBe("");
    });

    it("a sentence that holds a tally or starts with the word Status is read as none", () => {
      const lines = "Status quo must go\nVote YES 99% (threshold 1%) now\nStatus: passed in the text, says me\n";
      expect(proposalOf(withHead("T", lines))).toStrictEqual({
        id: 15,
        title: "T",
        state: "passed in the text, says me",
      });
    });

    it("two lines that both read as the state or the tally leave the state or the tally out", () => {
      const forged = "**Status:** passed\nYES 99% (threshold 1%)\n";
      expect(proposalOf(withHead("T", `${forged}${REAL}`))).toStrictEqual({ id: 15, title: "T", state: "" });
      expect(proposalOf(withHead("T", `${REAL}${forged}`))).toStrictEqual({ id: 15, title: "T", state: "" });
      expect(proposalOf(withHead("T", `${REAL}Status: x\n`))).toStrictEqual({
        id: 15,
        title: "T",
        state: "",
        yes: 33,
        threshold: 66.66,
      });
      expect(proposalOf(withHead("T", `${REAL}YES 1% (threshold 1%)\n`))).toStrictEqual({
        id: 15,
        title: "T",
        state: "active",
      });
    });

    it("a second heading makes the page no proposal's", () => {
      expect(proposalOf(withHead("T", `${REAL}# Proposal #16: another\n`))).toBeUndefined();
    });

    it("any text in a title or in lines that are not whole-line fields never changes the realm's tally and state", () => {
      fc.assert(
        fc.property(fc.string({ unit: "binary" }), fc.string({ unit: "binary" }), (words, more) => {
          const noBreak = (text: string) => text.replaceAll(/[\n\r\u2028\u2029\v\f\u0085]/g, " ");
          const title = `${noBreak(words)} YES 99% (threshold 1%) Status: passed`;
          const noise = `x ${noBreak(more)} YES 99% (threshold 1%)\nStatus quo\n- Status: forged`;
          const got = proposalOf(`# Proposal #15: ${title}\n${noise}\n${REAL}`);
          expect(got?.yes).toBe(33);
          expect(got?.threshold).toBe(66.66);
          expect(got?.state).toBe("active");
        }),
        { numRuns: 300 },
      );
    });
  });

  it("keeps a hostile title as the same text, and cuts a very long one at the bound", () => {
    expect(proposalOf(`# Proposal #1: ${HOSTILE}\n**Status:** active`)?.title).toBe(HOSTILE);
    const cut = proposalOf(`# Proposal #1: ${"é".repeat(5000)}\n**Status:** active`);
    expect(cut?.title.length).toBeLessThanOrEqual(200);
    expect(cut?.title.endsWith("…")).toBe(true);
  });

  it("bounds a title and a state in code units, so one letter with thousands of marks is cut", () => {
    const marks = "\u0301".repeat(60_000);
    const got = proposalOf(`# Proposal #1: a${marks}\n**Status:** b${marks}`);
    expect(got).toBeDefined();
    expect(got?.title.length).toBeLessThanOrEqual(PROPOSAL_CAPS.title);
    expect(got?.state.length).toBeLessThanOrEqual(PROPOSAL_CAPS.state);
  });

  it("keeps a hostile state as text within its bound, and an empty state as none", () => {
    const hostile = proposalOf(`# Proposal #1: T\n**Status:** ${HOSTILE.repeat(5)}`);
    expect(hostile?.state.length).toBeLessThanOrEqual(40);
    expect(hostile?.state.startsWith("<img")).toBe(true);
    expect(proposalOf("# Proposal #1: T\n")?.state).toBe("");
    expect(proposalOf("# Proposal #1: T\nStatus:\n")?.state).toBe("");
  });

  // The page is cut at its bound before anything is read: the only tally is past it, so it is no tally.
  it("reads a page only as far as its bound", () => {
    const filler = (n: number) => `${"x".repeat(80)}\n`.repeat(n);
    const bound = 64 * 1024;
    const head = "# Proposal #15: T\n";
    const tally = "YES 99% (threshold 1%)\n";
    const room = Math.floor((bound - head.length - tally.length) / 81);
    const inside = `${head}${filler(room)}${tally}`;
    expect(inside.length).toBeLessThanOrEqual(bound);
    expect(proposalOf(inside)?.yes).toBe(99);
    const outside = `${head}${filler(Math.ceil(bound / 81))}${tally}`;
    expect(outside.length).toBeGreaterThan(bound);
    expect(proposalOf(outside)).toStrictEqual({ id: 15, title: "T", state: "" });
    holds(proposalOf(`${PAGE}${"x ".repeat(128 * 1024)}`));
  });

  // Every field's regex, on 64 KB of what a proposer controls: blanks and tabs after each start, then a mark that fails the
  // match. Seconds on a quadratic pattern (the review measured 3.3 s on the old threshold regex), a few ms on a linear one.
  describe("linear in the page (a proposer's page must not freeze the tab)", () => {
    const N = 64 * 1024;
    const STARTS = [
      "# Proposal #1:",
      "# Proposal #1",
      "# Proposal",
      "#",
      "Status:",
      "**Status:**",
      "Status",
      "YES 1%",
      "YES",
      "YES 1% (threshold",
      "YES 1% (threshold 2%",
      "YES 1% (threshold 2%)",
    ];
    const SHAPES: [string, string][] = STARTS.flatMap((start) =>
      [" ", "\t", " \t"].flatMap((blank): [string, string][] => [
        [`${start} then blanks and a letter`, `${start}${blank.repeat(N / blank.length)}a`],
        [`${start} then blanks, no end`, `${start}${blank.repeat(N / blank.length)}`],
        [`a heading, then ${start} and blanks`, `# Proposal #1: T\n${start}${blank.repeat(N / blank.length)}a`],
        [
          `a heading, then many lines of ${start} and a blank`,
          `# Proposal #1: T\n${`${start}${blank}\n`.repeat(Math.ceil(N / (start.length + 2)))}`,
        ],
      ]),
    );
    const timeOf = (page: string): number =>
      Math.min(
        ...Array.from({ length: 3 }, () => {
          const start = performance.now();
          proposalOf(page);
          return performance.now() - start;
        }),
      );

    it.each(SHAPES)("%s reads in under 250 ms", (_name, page) => {
      expect(page.length).toBeGreaterThanOrEqual(N);
      expect(timeOf(page)).toBeLessThan(250);
    });
  });

  it("never throws, and gives only a bounded proposal or nothing, for any text", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        holds(proposalOf(text));
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(
        fc.string({ unit: "binary" }),
        fc.string({ unit: "binary" }),
        fc.nat(999_999_999),
        (title, rest, id) => {
          const got = proposalOf(`# Proposal #${String(id)}: ${title}\n${rest}`);
          holds(got);
          if (got !== undefined) expect(got.id).toBe(id);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never throws on a hostile page built of the page's own pieces, in any order", () => {
    const piece = fc.constantFrom(
      "# Proposal #15: T",
      "# Proposal #16: U",
      "**Status:** active",
      "Status: passed",
      "YES 33% (threshold 66.66%)",
      "YES 99% (threshold 1%)",
      "YES",
      "",
      "  \t ",
      HOSTILE,
    );
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 12 }), (pieces) => {
        holds(proposalOf(pieces.join("\n")));
      }),
      { numRuns: 500 },
    );
  });
});

describe("readProposal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const answering = (body: unknown, init?: ResponseInit) =>
    vi.fn<ChainFetch>(() => Promise.resolve(new Response(JSON.stringify(body), init)));
  const options = (fetcher: ChainFetch): ReadOptions => ({ fetch: fetcher, now: () => NOW });
  const failureKind = (result: ChainRead<unknown>) => (result.ok ? "ok" : result.failure.kind);

  it("asks the realm's page of that number once and gives the proposal with its source", async () => {
    const fetcher = answering(queryEnvelope({ data: PAGE }));
    const result = await readProposal(RPC, { realm: REALM, id: 15 }, options(fetcher));
    expect(result.ok && result.value.id).toBe(15);
    expect(result.source.at).toBe(NOW.toISOString());
    expect(fetcher).toHaveBeenCalledTimes(1);
    const hex = /data=0x([0-9a-f]+)/.exec(fetcher.mock.calls[0]?.[0] ?? "")?.[1] ?? "";
    expect(new TextDecoder().decode(Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16)))).toBe(
      `${REALM}:15`,
    );
  });

  it("says wrong-shape for a page that holds no proposal, and the page's words reach nothing", async () => {
    const result = await readProposal(
      RPC,
      { realm: REALM, id: 15 },
      options(answering(queryEnvelope({ data: `# ${HOSTILE}` }))),
    );
    expect(failureKind(result)).toBe("wrong-shape");
    expect(JSON.stringify(result)).not.toContain("alert");
  });

  it("says wrong-shape for a page of another number than the one asked", async () => {
    const result = await readProposal(RPC, { realm: REALM, id: 16 }, options(answering(queryEnvelope({ data: PAGE }))));
    expect(failureKind(result)).toBe("wrong-shape");
  });

  it("says no-realm when the chain has none there, and too-big past the cap", async () => {
    const refused = queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } });
    expect(failureKind(await readProposal(RPC, { realm: REALM, id: 15 }, options(answering(refused))))).toBe(
      "no-realm",
    );
    const huge = queryEnvelope({ data: `${PAGE}${"x".repeat(2 * 1024 * 1024)}` });
    expect(failureKind(await readProposal(RPC, { realm: REALM, id: 15 }, options(answering(huge))))).toBe("too-big");
  });

  it("says down for a 500, bad-name for a realm or number that is none, refused for http, and asks nothing for the last two", async () => {
    expect(
      failureKind(await readProposal(RPC, { realm: REALM, id: 15 }, options(answering({}, { status: 500 })))),
    ).toBe("down");
    const fetcher = answering(queryEnvelope({ data: PAGE }));
    for (const bad of [
      { realm: "gno.land/p/demo/x", id: 1 },
      { realm: REALM, id: -1 },
      { realm: REALM, id: 1.5 },
      { realm: REALM, id: Number.NaN },
    ]) {
      expect(failureKind(await readProposal(RPC, bad, options(fetcher)))).toBe("bad-name");
    }
    expect(failureKind(await readProposal("http://rpc.example", { realm: REALM, id: 1 }, options(fetcher)))).toBe(
      "refused",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
