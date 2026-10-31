import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryEnvelope } from "../../../tests/chain/chainEnvelopes.ts";
import type { ChainFetch, ChainRead, ReadOptions } from "./read.ts";
import { proposalOf, readProposal, type Proposal } from "./proposal.ts";

// 5k, a GovDAO page to a Proposal. THE PAGE FORMAT IS A GUESS (F2951): the pages here are SYNTHETIC. What is proved is the
// contract for any text: it never throws, gives a bounded Proposal or nothing, and the realm's words stay text.
const RPC = "https://rpc.onyx.testnets.gno.land:443";
const REALM = "gno.land/r/gov/dao";
const NOW = new Date("2026-10-31T06:00:00.000Z");
const PAGE = "# Proposal #15: Raise the storage deposit cap\n\n**Status:** active\n\nYES 33% (threshold 66.66%)\n";
const HOSTILE = "<img src=x onerror=alert(1)><script>alert(2)</script>[x](javascript:alert(3))‮";

function holds(proposal: Proposal | undefined): void {
  if (proposal === undefined) return;
  expect(Number.isSafeInteger(proposal.id) && proposal.id >= 0).toBe(true);
  expect(proposal.title.length).toBeLessThanOrEqual(200);
  expect(proposal.state.length).toBeLessThanOrEqual(40);
  for (const share of [proposal.yes, proposal.threshold]) {
    if (share !== undefined) expect(Number.isFinite(share) && share >= 0 && share <= 100).toBe(true);
  }
  expect(Object.keys(proposal).every((key) => ["id", "title", "state", "yes", "threshold"].includes(key))).toBe(true);
}

describe("proposalOf", () => {
  it("reads the number, the title, the state and the tally of a page written to its rules (synthetic)", () => {
    expect(proposalOf(PAGE)).toEqual({
      id: 15,
      title: "Raise the storage deposit cap",
      state: "active",
      yes: 33,
      threshold: 66.66,
    });
  });

  it("gives no tally the page did not give, and no number outside 0 to 100", () => {
    const head = "# Proposal #3: A title\n\n**Status:** passed\n";
    expect(proposalOf(head)).toEqual({ id: 3, title: "A title", state: "passed" });
    expect(proposalOf(`${head}YES 140% (threshold 50%)`)).toEqual({
      id: 3,
      title: "A title",
      state: "passed",
      threshold: 50,
    });
    expect(proposalOf(`${head}YES 20% (threshold 1e9%)`)).toEqual({
      id: 3,
      title: "A title",
      state: "passed",
      yes: 20,
    });
  });

  it.each([
    "",
    "no proposal here",
    "# Proposal #: no number",
    "# Proposal #-1: negative",
    "# Proposal #1.5: fraction",
    "# Proposal #99999999999999999999: huge",
  ])("gives nothing for %j", (page) => {
    expect(proposalOf(page)).toBeUndefined();
  });

  it("keeps a hostile title as the same text, and cuts a very long one at the bound", () => {
    expect(proposalOf(`# Proposal #1: ${HOSTILE}\n**Status:** active`)?.title).toBe(HOSTILE);
    const cut = proposalOf(`# Proposal #1: ${"é".repeat(5000)}\n**Status:** active`);
    expect(cut?.title.length).toBeLessThanOrEqual(200);
    expect(cut?.title.endsWith("…")).toBe(true);
  });

  it("keeps a hostile state as text within its bound, and an empty state as none", () => {
    const hostile = proposalOf(`# Proposal #1: T\n**Status:** ${HOSTILE.repeat(5)}`);
    expect(hostile?.state.length).toBeLessThanOrEqual(40);
    expect(proposalOf("# Proposal #1: T\n")?.state).toBe("");
  });

  it("reads a page of 256 KB without throwing, and only as far as its bound", () => {
    const page = `${PAGE}${"x ".repeat(128 * 1024)}\nYES 99% (threshold 1%)`;
    holds(proposalOf(page));
    expect(proposalOf(page)?.yes).toBe(33);
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
