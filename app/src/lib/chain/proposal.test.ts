import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { queryEnvelope } from "../../../tests/chain/chainEnvelopes.ts";
import type { ChainFetch, ReadOptions } from "@gnoworld/chain/read";
import { PROPOSAL_CAPS, Proposal } from "@gnoworld/schemas/proposal";
import { proposalsOf, readProposals } from "./proposal.ts";

// 5k2, a GovDAO home page to its proposals, against pages RECORDED through gnomcp (F2951): app/tests/chain/recorded/, each file's first
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
const HOME_GNOLAND = recorded("gnoland-1-gov-dao-home.md");
const HOME_ONYX = recorded("onyx-1-gov-dao-home.md");

describe("the recorded pages (gnoland-1 at 1208146, onyx-1 at 796366, 2026-10-31)", () => {
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

describe("a proposer's words are never the realm's state", () => {
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
        proposalsOf(page);
        return performance.now() - start;
      }),
    );

  it.each(SHAPES)("%s reads in under 250 ms", (_name, page) => {
    expect(page.length).toBeGreaterThanOrEqual(N);
    expect(timeOf(page)).toBeLessThan(250);
  });
});

describe("readProposals", () => {
  const answering = (body: unknown, init?: ResponseInit) =>
    vi.fn<ChainFetch>(() => Promise.resolve(new Response(JSON.stringify(body), init)));
  const options = (fetcher: ChainFetch): ReadOptions => ({ fetch: fetcher, now: () => NOW });

  it("asks the realm's home page once and gives the proposals it lists, newest first as written, with its source", async () => {
    const fetcher = answering(queryEnvelope({ data: HOME_ONYX }));
    const result = await readProposals(RPC, REALM, options(fetcher));
    expect(result.ok && result.value.map(({ id }) => id)).toEqual([37, 36, 35, 34, 33]);
    expect(result.ok && result.value.every(({ yes, threshold }) => yes === undefined && threshold === undefined)).toBe(
      true,
    );
    expect(result.source.at).toBe(NOW.toISOString());
    expect(fetcher).toHaveBeenCalledTimes(1);
    const hex = /data=0x([0-9a-f]+)/.exec(fetcher.mock.calls[0]?.[0] ?? "")?.[1] ?? "";
    expect(new TextDecoder().decode(Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16)))).toBe(
      `${REALM}:`,
    );
  });

  it("gives no proposal, not a failure, for a home page that lists none", async () => {
    const result = await readProposals(RPC, REALM, options(answering(queryEnvelope({ data: "# GovDAO\n" }))));
    expect(result.ok && result.value).toEqual([]);
  });

  it("passes a failed read on with its kind, as the page's own", async () => {
    const result = await readProposals(RPC, REALM, options(answering({}, { status: 503 })));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("down");
  });
});

// What proposalOf's tests held for a title and a state, now of a home page's entries.
describe("a home page's titles and states are text and bounded", () => {
  const entry = (title: string, state = "ACTIVE") =>
    `### [Prop #7 - ${title}](/r/gov/dao:7)\nStatus: ${state}\n\n---\n`;

  it("keeps a hostile title as the same text, and cuts a very long one at the bound", () => {
    expect(proposalsOf(entry(HOSTILE))[0]?.title).toBe(HOSTILE);
    const [long] = proposalsOf(entry("x".repeat(5000)));
    expect(long?.title.length).toBeLessThanOrEqual(PROPOSAL_CAPS.title);
    expect(long?.title.endsWith("…")).toBe(true);
  });

  it("bounds a title and a state in code units, so one letter with thousands of marks stays within the bound", () => {
    const marks = `e${"\u0301".repeat(5000)}`;
    const [listed] = proposalsOf(entry(marks, marks));
    expect(listed?.title.length).toBeLessThanOrEqual(PROPOSAL_CAPS.title);
    expect(listed?.state.length).toBeLessThanOrEqual(PROPOSAL_CAPS.state);
  });

  it("reads a page only as far as its bound", () => {
    expect(proposalsOf(`${"\n".repeat(70 * 1024)}${entry("T")}`)).toEqual([]);
  });

  it("gives only bounded proposals that fit the schema, or nothing, for any text, and never throws", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 4000 }), (text) => {
        const listed = proposalsOf(text);
        expect(Array.isArray(listed)).toBe(true);
        for (const proposal of listed) expect(Proposal.safeParse(proposal).success).toBe(true);
      }),
    );
  });
});
