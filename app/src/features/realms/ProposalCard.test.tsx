// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { FAILURE_KINDS } from "../../../tests/chain/failureKinds.ts";
import { mount } from "../../../tests/mount.tsx";
import type { Proposal } from "../../lib/chain/proposal.ts";
import type { ChainRead } from "../../lib/chain/read.ts";
import { ProposalCard, ProposalView } from "./ProposalCard.tsx";

// Slice 5k (ADR-0002 §4, proposal cards: read only, votes stay in their realms; frames 22 and 27). The proposal is invented:
// no GovDAO answer is recorded, so these prove how a parsed proposal is DRAWN. The card has no vote button, and links only to
// the two gnoweb hosts the data names, stated here and not through the code under test.
const SOURCE = { url: "https://rpc.onyx.testnets.gno.land:443/abci_query", at: "2026-10-31T06:00:00.000Z" };
const PROPOSAL: Proposal = {
  id: 15,
  title: "Raise the storage deposit cap",
  state: "active",
  yes: 33,
  threshold: 66.66,
};
const GNOWEB = "https://onyx.testnets.gno.land/r/gov/dao:15";
const GNO_LAND = "https://gno.land/r/gov/dao:15";

function draw(props: { proposal?: Proposal; href?: string } = {}) {
  return mount(<ProposalCard proposal={PROPOSAL} source={SOURCE} href={GNOWEB} {...props} />);
}
const field = (el: HTMLElement, name: string) => el.querySelector(`[data-field='${name}']`)?.textContent;

describe("a proposal's card", () => {
  it("says the number, the title, the state and the tally, each in its own place", () => {
    const el = draw();
    expect(field(el, "number")).toBe("Proposal 15");
    expect(el.querySelector("h3")?.textContent).toBe("Raise the storage deposit cap");
    expect(field(el, "state")).toBe("active");
    expect(field(el, "tally")).toBe("YES 33% of 66.66%");
  });

  it("names where it was read and when, as a machine-readable time and its words", () => {
    const el = draw();
    expect(el.querySelector("time")?.getAttribute("datetime")).toBe(SOURCE.at);
    expect(el.textContent).toContain("Read from rpc.onyx.testnets.gno.land at 2026-10-31 06:00 UTC");
  });

  it("leaves out the state the page did not give, rather than an empty line", () => {
    expect(field(draw({ proposal: { ...PROPOSAL, state: "" } }), "state")).toBeUndefined();
  });

  it("carries the way to read the proposal on gnoweb", () => {
    expect(draw().querySelector(`a[href='${GNOWEB}']`)).not.toBeNull();
    expect(draw({ href: GNO_LAND }).querySelector(`a[href='${GNO_LAND}']`)).not.toBeNull();
  });

  it("has no vote button: reading only", () => {
    const el = draw();
    expect(el.textContent).not.toMatch(/\bvote\b/i);
    expect(el.querySelector("button")).toBeNull();
  });

  it.each([
    ["no tally", { id: 15, title: "T", state: "active" }],
    ["a yes with no threshold", { id: 15, title: "T", state: "active", yes: 33 }],
    ["a threshold with no yes", { id: 15, title: "T", state: "active", threshold: 66.66 }],
  ])("shows no number the realm did not give: %s, so no tally and no percent", (_name, proposal) => {
    const el = draw({ proposal });
    expect(field(el, "tally")).toBeUndefined();
    expect(el.textContent).not.toMatch(/%|NaN|Infinity|undefined/);
  });

  it.each([
    [33.4, 66.666, "YES 33% of 66.67%"],
    [33.5, 66.125, "YES 34% of 66.13%"],
    [33.6, 12.375, "YES 34% of 12.38%"],
    [99.5, 100, "YES 100% of 100%"],
    [0.4, 50, "YES 0% of 50%"],
  ])("rounds %s and %s to the words the pill beside it says: %s", (yes, threshold, words) => {
    expect(field(draw({ proposal: { ...PROPOSAL, yes, threshold } }), "tally")).toBe(words);
  });

  it.each([0, 1, 99999])("says a proposal number %s", (id) => {
    expect(field(draw({ proposal: { ...PROPOSAL, id } }), "number")).toBe(`Proposal ${String(id)}`);
  });

  it("draws a hostile title as text and creates no element from it", () => {
    const hostile = "<img src=x onerror=alert(1)><script>alert(2)</script>";
    const el = draw({ proposal: { ...PROPOSAL, title: hostile } });
    expect(el.querySelector("img, script")).toBeNull();
    expect(el.querySelector("h3")?.textContent).toBe(hostile);
  });

  it("draws a hostile state as text and creates no element from it", () => {
    const hostile = "<img src=x onerror=alert(1)><b>x</b>";
    const el = draw({ proposal: { ...PROPOSAL, state: hostile } });
    expect(el.querySelector("img, b")).toBeNull();
    expect(field(el, "state")).toBe(hostile);
  });

  it("cuts a title of thousands of graphemes at 120, with an ellipsis", () => {
    const title = draw({ proposal: { ...PROPOSAL, title: "é".repeat(3000) } }).querySelector("h3")?.textContent ?? "";
    expect(title.length).toBe(120);
    expect(title.endsWith("…")).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.example/x",
    "http://evil.example/x",
    "http://onyx.testnets.gno.land/r/gov/dao:15",
    "https://evil.example/r/gov/dao:15",
    "https://onyx.testnets.gno.land.evil.example/r/gov/dao:15",
    "https://evil.example/?https://onyx.testnets.gno.land/r/gov/dao:15",
    "https://evil.example/#https://onyx.testnets.gno.land/r/gov/dao:15",
    "https://onyx.testnets.gno.land@evil.example/r/gov/dao:15",
    "https://user@onyx.testnets.gno.land/r/gov/dao:15",
    "https://onyx.testnets.gno.land:8443/r/gov/dao:15",
    "HTTPS://onyx.testnets.gno.land/r/gov/dao:15",
    "https://gno.land.evil.example/r/gov/dao:15",
    "https://onyx.testnets.gno.land",
    "https://onyx.testnets.gno.land/",
    "https://onyx.testnets.gno.land/r/gov/dao:15 ",
    " https://onyx.testnets.gno.land/r/gov/dao:15",
    "https://onyx.testnets.gno.land/r/gov/dao:15\u0000",
    "",
  ])("draws the address %j as no link", (href) => {
    expect(draw({ href }).querySelector("a")).toBeNull();
  });
});

describe("a proposal read, as the page draws it", () => {
  it("draws the card of a read that worked", () => {
    const read: ChainRead<Proposal> = { ok: true, value: PROPOSAL, source: SOURCE };
    expect(field(mount(<ProposalView read={read} href={GNOWEB} />), "number")).toBe("Proposal 15");
  });

  it.each(FAILURE_KINDS)(
    "draws a failed read of kind %s as its next step and its source, with no card and no number",
    (kind) => {
      const next = `The next step for ${kind}.`;
      const read: ChainRead<Proposal> = { ok: false, failure: { kind, next }, source: SOURCE };
      const el = mount(<ProposalView read={read} href={GNOWEB} />);
      expect(el.querySelector("[role='alert']")?.textContent).toContain(next);
      expect(el.textContent).toContain("rpc.onyx.testnets.gno.land");
      expect(el.querySelector("time")?.getAttribute("datetime")).toBe(SOURCE.at);
      expect(el.querySelector("h3, [data-field]")).toBeNull();
    },
  );
});
