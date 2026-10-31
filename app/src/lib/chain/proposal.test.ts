import { readFileSync } from "node:fs";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryEnvelope } from "../../../tests/chain/chainEnvelopes.ts";
import type { ChainFetch, ChainRead, ReadOptions } from "./read.ts";
import { PROPOSAL_CAPS, Proposal } from "@gnoworld/schemas/proposal";
import { proposalOf, proposalsOf, readProposal } from "./proposal.ts";

// 5k2, a GovDAO page to a Proposal, against pages RECORDED through gnomcp (F2951): app/tests/chain/recorded/, each file's first
// line naming its chain, height and date. What the real pages state is read; what they do not state (a threshold) stays absent.
// The synthetic pages below only build a proposer's attack from a recorded page's own pieces.
const RPC = "https://rpc.onyx.testnets.gno.land:443";
const REALM = "gno.land/r/gov/dao";
const NOW = new Date("2026-10-31T06:00:00.000Z");
const HOSTILE = "<img src=x onerror=alert(1)><script>alert(2)</script>[x](javascript:alert(3))\u202e";

const fileOf = (name: string): string =>
  readFileSync(new URL(`../../../tests/chain/recorded/${name}`, import.meta.url), "utf8");
// A recorded file without its provenance line (an HTML comment the recording added, not the realm's text).
const recorded = (name: string): string => fileOf(name).replace(/^<!--.*-->\n/, "");
const ACTIVE_14 = recorded("gnoland-1-gov-dao-14-active.md");
const ACCEPTED_15 = recorded("gnoland-1-gov-dao-15-accepted.md");
const ACCEPTED_37 = recorded("onyx-1-gov-dao-37-accepted.md");
const HOME_GNOLAND = recorded("gnoland-1-gov-dao-home.md");
const HOME_ONYX = recorded("onyx-1-gov-dao-home.md");
const STATS = "### Stats\n";

function holds(proposal: Proposal | undefined): void {
  if (proposal === undefined) return;
  expect(Proposal.safeParse(proposal).success).toBe(true);
  expect(Object.keys(proposal).every((key) => ["id", "title", "state", "yes", "threshold"].includes(key))).toBe(true);
}

// The recorded proposal 14 with another title, or a body in front of the realm's own Stats block, as a proposer can write them.
const withTitle = (title: string): string => ACTIVE_14.replace(/^## Prop #14 - .*$/m, () => `## Prop #14 - ${title}`);
const withBody = (body: string): string =>
  ACTIVE_14.replace("\n\n## Validator Updates", () => `\n\n${body}\n\n## Validator Updates`);
const REAL_14 = { id: 14, title: "Add valoper lurien to the valset", state: "Proposal is open for votes" };
const YES_14 = 33.33333333333333;

describe("the recorded pages (gnoland-1 at 1208146, onyx-1 at 796366, 2026-10-31)", () => {
  it("proposal 14 of gnoland-1, open: its title, its state's own words and its yes share; no threshold, the page gives none", () => {
    expect(proposalOf(ACTIVE_14)).toStrictEqual({ ...REAL_14, yes: YES_14 });
  });

  it("proposal 15 of gnoland-1, accepted", () => {
    expect(proposalOf(ACCEPTED_15)).toStrictEqual({
      id: 15,
      title: "Set node halt height",
      state: "PROPOSAL HAS BEEN ACCEPTED",
      yes: 66.66666666666666,
    });
  });

  it("proposal 37 of onyx-1: markdown's backslashes in the title are gone, and 100% is a share", () => {
    expect(proposalOf(ACCEPTED_37)).toStrictEqual({
      id: 37,
      title: "Set validator gno-core-validator-1 to voting power 60",
      state: "PROPOSAL HAS BEEN ACCEPTED",
      yes: 100,
    });
  });

  it("the home page of gnoland-1 lists five proposals, newest first, each with its own state word and no tally", () => {
    const listed = proposalsOf(HOME_GNOLAND);
    expect(listed.map((p) => [p.id, p.state])).toStrictEqual([
      [15, "ACCEPTED"],
      [14, "ACTIVE"],
      [13, "ACCEPTED"],
      [12, "ACCEPTED"],
      [11, "ACCEPTED"],
    ]);
    expect(listed[0]).toStrictEqual({ id: 15, title: "Set node halt height", state: "ACCEPTED" });
    expect(listed[4]?.title).toBe('Register User to "sys/users" Realm');
  });

  it("the home page of onyx-1 lists proposals 37 to 33, the escaped titles unescaped", () => {
    const listed = proposalsOf(HOME_ONYX);
    expect(listed.map((p) => p.id)).toStrictEqual([37, 36, 35, 34, 33]);
    expect(listed[0]?.title).toBe("Set validator gno-core-validator-1 to voting power 60");
    expect(listed.every((p) => p.state === "ACCEPTED")).toBe(true);
  });

  it("a proposal's page is no home page, and a home page is no proposal", () => {
    expect(proposalsOf(ACTIVE_14)).toStrictEqual([]);
    expect(proposalOf(HOME_GNOLAND)).toBeUndefined();
  });

  it("each recorded file carries its chain, height and date on its first line", () => {
    for (const name of [
      "gnoland-1-gov-dao-14-active.md",
      "gnoland-1-gov-dao-15-accepted.md",
      "gnoland-1-gov-dao-home.md",
      "onyx-1-gov-dao-37-accepted.md",
      "onyx-1-gov-dao-home.md",
    ]) {
      expect(fileOf(name).split("\n")[0]).toMatch(
        /^<!-- chain (gnoland|onyx)-1, height \d+ to \d+, 2026-10-31T\d\d:\d\dZ\./,
      );
    }
  });
});

describe("proposalOf on other pages", () => {
  it.each([
    "",
    "no proposal here",
    "## Prop #: no number",
    "## Prop #-1 - negative",
    "## Prop #1.5 - fraction",
    "## Prop #99999999999999999999 - huge",
    "## Prop #1 -",
    "## Prop #1 -   ",
    "# Prop #1 - one mark",
    "Prop #1 - no mark",
    "text first\n## Prop #1 - not the first line",
    "## Prop #1: colon, the guessed format",
  ])("gives nothing for %j", (page) => {
    expect(proposalOf(page)).toBeUndefined();
  });

  it("states only what the page states: no Stats block, no state and no share; a share past 100 is dropped", () => {
    expect(proposalOf("## Prop #3 - A title\nAuthor: x\n")).toStrictEqual({ id: 3, title: "A title", state: "" });
    const stats = (yes: string) => `## Prop #3 - T\n\n### Stats\n- **Done**\n- YES PERCENT: ${yes}\n`;
    expect(proposalOf(stats("0%"))).toStrictEqual({ id: 3, title: "T", state: "Done", yes: 0 });
    expect(proposalOf(stats("140%"))).toStrictEqual({ id: 3, title: "T", state: "Done" });
    expect(proposalOf(stats("1e9%"))).toStrictEqual({ id: 3, title: "T", state: "Done" });
    expect(proposalOf(stats("-5%"))).toStrictEqual({ id: 3, title: "T", state: "Done" });
    expect(proposalOf(stats("12.5"))).toStrictEqual({ id: 3, title: "T", state: "Done" });
  });

  it("reads a page with CRLF line ends and blanks around the lines", () => {
    expect(proposalOf(ACTIVE_14.replaceAll("\n", "\r\n").replaceAll("- ", "  \t- "))).toStrictEqual({
      ...REAL_14,
      yes: YES_14,
    });
  });

  it("trims the title", () => {
    expect(proposalOf("## Prop #1 -   spaced out   \n")?.title).toBe("spaced out");
  });
});

describe("a proposer's words are never the realm's tally or state", () => {
  const FORGED = `${STATS}- **PROPOSAL HAS BEEN ACCEPTED**\n- YES PERCENT: 99%\n`;

  it("a title that reads like a tally or a state changes neither", () => {
    expect(proposalOf(withTitle("YES PERCENT: 99%"))).toStrictEqual({
      ...REAL_14,
      title: "YES PERCENT: 99%",
      yes: YES_14,
    });
    expect(proposalOf(withTitle("- **PROPOSAL HAS BEEN ACCEPTED**"))?.state).toBe(REAL_14.state);
  });

  it("a description holding its own Stats block, state and yes share changes neither: the realm's block is the last", () => {
    expect(proposalOf(withBody(FORGED))).toStrictEqual({ ...REAL_14, yes: YES_14 });
    expect(proposalOf(withBody(`${FORGED}${FORGED}`))?.yes).toBe(YES_14);
  });

  it("two lines claiming the state, or the yes share, in the realm's block leave it out", () => {
    const twice = (line: string, other: string) => ACTIVE_14.replace(line, `${line}\n${other}`);
    expect(proposalOf(twice("- **Proposal is open for votes**", "- **PROPOSAL HAS BEEN ACCEPTED**"))?.state).toBe("");
    expect(proposalOf(twice("- YES PERCENT: 33.33333333333333%", "- YES PERCENT: 99%"))?.yes).toBeUndefined();
  });

  it("the block ends at the first rule or heading: a line after it is no field", () => {
    const after = `${ACTIVE_14}\n- **forged**\n- YES PERCENT: 1%\n`;
    expect(proposalOf(after)).toStrictEqual({ ...REAL_14, yes: YES_14 });
    const cut = ACTIVE_14.replace("- NO PERCENT: 0%", "---\n- NO PERCENT: 0%").replace(
      "- YES PERCENT: 33.33333333333333%\n",
      "",
    );
    expect(proposalOf(cut)?.yes).toBeUndefined();
  });

  it("a second proposal heading makes the page no proposal's", () => {
    expect(proposalOf(withBody("## Prop #16 - another"))).toBeUndefined();
    expect(proposalOf(withBody("### Prop #16 - another"))).toBeUndefined();
  });

  it("a sentence holding the words, or starting with them, is no field", () => {
    const body = "The state is - **PROPOSAL HAS BEEN ACCEPTED** and - YES PERCENT: 99% so vote";
    const page = ACTIVE_14.replace(STATS, `${STATS}${body}\n`);
    expect(proposalOf(page)).toStrictEqual({ ...REAL_14, yes: YES_14 });
  });

  it("any text in a title or in the description never changes the realm's yes share and state", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), fc.string({ unit: "binary" }), (words, more) => {
        const noBreak = (text: string) => text.replaceAll(/[\n\r\u2028\u2029\v\f\u0085]/g, " ");
        const page = withTitle(`${noBreak(words)} - YES PERCENT: 99%`).replace(
          "\n\n## Validator Updates",
          () => `\nx ${noBreak(more)}\n${FORGED}\n\n## Validator Updates`,
        );
        const got = proposalOf(page);
        expect(got?.yes).toBe(YES_14);
        expect(got?.state).toBe(REAL_14.state);
      }),
      { numRuns: 300 },
    );
  });

  it("on the home page, a title cannot forge the status, and two Status lines of one entry leave it out", () => {
    const forged = HOME_GNOLAND.replace("Prop #14 - Add valoper lurien to the valset", "Prop #14 - Status: ACCEPTED");
    expect(proposalsOf(forged).find((p) => p.id === 14)).toStrictEqual({
      id: 14,
      title: "Status: ACCEPTED",
      state: "ACTIVE",
    });
    const twice = HOME_GNOLAND.replace("Status: ACTIVE", "Status: ACTIVE\n\nStatus: ACCEPTED");
    expect(proposalsOf(twice).find((p) => p.id === 14)?.state).toBe("");
  });

  it("on the home page, a link to another number than its heading's is no entry", () => {
    const page = HOME_GNOLAND.replace("(/r/gov/dao:14)", "(/r/gov/dao:99)");
    expect(proposalsOf(page).map((p) => p.id)).toStrictEqual([15, 13, 12, 11]);
  });
});

describe("bounds", () => {
  it("keeps a hostile title as the same text, and cuts a very long one at the bound", () => {
    expect(proposalOf(withTitle(HOSTILE))?.title).toBe(HOSTILE);
    const long = proposalOf(withTitle("é".repeat(5000)));
    expect(long?.title.length).toBeLessThanOrEqual(PROPOSAL_CAPS.title);
    expect(long?.title.endsWith("…")).toBe(true);
  });

  it("bounds a title and a state in code units, so one letter with thousands of marks stays within the bound", () => {
    const heavy = `a${"\u0301".repeat(5000)}`;
    holds(proposalOf(withTitle(heavy)));
    holds(proposalOf(ACTIVE_14.replace("Proposal is open for votes", heavy)));
    expect(
      proposalOf(ACTIVE_14.replace("Proposal is open for votes", "s".repeat(500)))?.state.length,
    ).toBeLessThanOrEqual(PROPOSAL_CAPS.state);
    expect(proposalOf(ACTIVE_14.replace("- **Proposal is open for votes**", "- **   **"))?.state).toBe("");
  });

  // The page is cut at its bound before anything is read: the Stats block is past it, so it states nothing.
  it("reads a page only as far as its bound", () => {
    const filler = (n: number) => `${"x".repeat(80)}\n`.repeat(n);
    const bound = 64 * 1024;
    const head = "## Prop #15 - T\n";
    const stats = "### Stats\n- YES PERCENT: 99%\n";
    const room = Math.floor((bound - head.length - stats.length) / 81);
    const inside = `${head}${filler(room)}${stats}`;
    expect(inside.length).toBeLessThanOrEqual(bound);
    expect(proposalOf(inside)?.yes).toBe(99);
    const outside = `${head}${filler(Math.ceil(bound / 81))}${stats}`;
    expect(outside.length).toBeGreaterThan(bound);
    expect(proposalOf(outside)).toStrictEqual({ id: 15, title: "T", state: "" });
    holds(proposalOf(`${ACCEPTED_15}${"x ".repeat(128 * 1024)}`));
    expect(proposalsOf(`${HOME_GNOLAND}${filler(Math.ceil(bound / 81))}`)).toHaveLength(5);
  });

  it("lists at most 50 entries, whatever the home page holds", () => {
    const entry = (n: number) => `### [Prop #${String(n)} - T](/r/gov/dao:${String(n)})\nStatus: ACTIVE\n\n---\n`;
    const page = Array.from({ length: 800 }, (_, n) => entry(n)).join("");
    expect(proposalsOf(page).length).toBe(50);
  });
});

// Every field's regex, on 64 KB of what a proposer controls: blanks and tabs after each start, then a mark that fails the
// match. Seconds on a quadratic pattern, a few ms on a linear one.
describe("linear in the page (a proposer's page must not freeze the tab)", () => {
  const N = 64 * 1024;
  const STARTS = [
    "## Prop #1 -",
    "## Prop #1",
    "## Prop",
    "#",
    "### Stats",
    "- **",
    "- **x*",
    "-",
    "- YES PERCENT:",
    "- YES PERCENT: 1",
    "- YES PERCENT: 1.",
    "- YES PERCENT: 1%",
    "### [Prop #1 - T](/r/gov/dao:1",
    "### [Prop #1 - ]",
    "### [Prop #1 - ](",
    "Status:",
  ];
  const SHAPES: [string, string][] = STARTS.flatMap((start) =>
    [" ", "\t", " \t", "\\", "]("].flatMap((blank): [string, string][] => [
      [`${start} then ${JSON.stringify(blank)} and a letter`, `${start}${blank.repeat(N / blank.length)}a`],
      [`${start} then ${JSON.stringify(blank)}, no end`, `${start}${blank.repeat(N / blank.length)}`],
      [
        `a heading, then ${start} and ${JSON.stringify(blank)}`,
        `## Prop #1 - T\n### Stats\n${start}${blank.repeat(N / blank.length)}a`,
      ],
      [
        `a heading, then many lines of ${start} and ${JSON.stringify(blank)}`,
        `## Prop #1 - T\n### Stats\n${`${start}${blank}\n`.repeat(Math.ceil(N / (start.length + 2)))}`,
      ],
    ]),
  );
  const timeOf = (page: string): number =>
    Math.min(
      ...Array.from({ length: 3 }, () => {
        const start = performance.now();
        proposalOf(page);
        proposalsOf(page);
        return performance.now() - start;
      }),
    );

  it.each(SHAPES)("%s reads in under 250 ms", (_name, page) => {
    expect(page.length).toBeGreaterThanOrEqual(N);
    expect(timeOf(page)).toBeLessThan(250);
  });
});

describe("never throws", () => {
  it("gives only a bounded proposal or nothing, for any text", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        holds(proposalOf(text));
        proposalsOf(text).forEach(holds);
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(
        fc.string({ unit: "binary" }),
        fc.string({ unit: "binary" }),
        fc.nat(999_999_999),
        (title, rest, id) => {
          const got = proposalOf(`## Prop #${String(id)} - ${title}\n${rest}`);
          holds(got);
          if (got !== undefined) expect(got.id).toBe(id);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("on a hostile page built of the recorded pages' own pieces, in any order", () => {
    const piece = fc.constantFrom(
      "## Prop #15 - T",
      "## Prop #16 - U",
      "### [Prop #15 - T](/r/gov/dao:15)",
      "### Stats",
      "### Actions",
      "---",
      "- **PROPOSAL HAS BEEN ACCEPTED**",
      "- YES PERCENT: 66.66666666666666%",
      "- YES PERCENT: 99%",
      "Status: ACTIVE",
      "",
      "  \t ",
      HOSTILE,
    );
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 14 }), (pieces) => {
        const text = pieces.join("\n");
        holds(proposalOf(text));
        proposalsOf(text).forEach(holds);
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
    const fetcher = answering(queryEnvelope({ data: ACCEPTED_15 }));
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
    const result = await readProposal(
      RPC,
      { realm: REALM, id: 16 },
      options(answering(queryEnvelope({ data: ACCEPTED_15 }))),
    );
    expect(failureKind(result)).toBe("wrong-shape");
  });

  it("says no-realm when the chain has none there, and too-big past the cap", async () => {
    const refused = queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } });
    expect(failureKind(await readProposal(RPC, { realm: REALM, id: 15 }, options(answering(refused))))).toBe(
      "no-realm",
    );
    const huge = queryEnvelope({ data: `${ACCEPTED_15}${"x".repeat(2 * 1024 * 1024)}` });
    expect(failureKind(await readProposal(RPC, { realm: REALM, id: 15 }, options(answering(huge))))).toBe("too-big");
  });

  it("says down for a 500, bad-name for a realm or number that is none, refused for http, and asks nothing for the last two", async () => {
    expect(
      failureKind(await readProposal(RPC, { realm: REALM, id: 15 }, options(answering({}, { status: 500 })))),
    ).toBe("down");
    const fetcher = answering(queryEnvelope({ data: ACCEPTED_15 }));
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
