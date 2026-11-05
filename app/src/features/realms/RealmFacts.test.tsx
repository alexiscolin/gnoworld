// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainRead } from "@gnoworld/chain/read";
import { mount } from "../../../tests/mount.tsx";
import { FAILURE_KINDS } from "../../../tests/chain/failureKinds.ts";
import { RealmFacts, type RealmFactsValue } from "./RealmFacts.tsx";

// Slice 5k (ADR-0002 §4, realm facts from the indexer). The VALUES are invented: no indexer answer is recorded, so these prove
// how facts are DRAWN. Every fact shows its source and age; a fact not given is left out, never a zero; a failed read is its
// next step and no number; what a realm or account wrote is text, never markup.
const SOURCE = { url: "https://indexer.onyx.testnets.gno.land/graphql/query", at: "2026-10-31T06:00:00.000Z" };
const FACTS: RealmFactsValue = {
  path: "gno.land/r/gnoland/wugnot",
  deployer: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
  firstBlock: 786661,
};
const ok = (value: RealmFactsValue): ChainRead<RealmFactsValue> => ({ ok: true, value, source: SOURCE });

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
function draw(read: ChainRead<RealmFactsValue>) {
  return mount(<RealmFacts read={read} />);
}
// The element that holds a fact's value, found by its label, so a value is tied to its label and not just present on the card.
function valueOf(el: HTMLElement, label: string): Element | null {
  const term = [...el.querySelectorAll("dt")].find((node) => node.textContent === label);
  return term?.nextElementSibling ?? null;
}
const LABELS = ["Path", "Deployer", "First block"];

describe("a realm's facts", () => {
  it("pairs each label with its own value", () => {
    const el = draw(ok(FACTS));
    expect(valueOf(el, "Path")?.textContent).toBe("gno.land/r/gnoland/wugnot");
    expect(valueOf(el, "Deployer")?.textContent).toBe("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
    expect(valueOf(el, "First block")?.textContent).toBe("786,661");
  });

  it("names the source and the time it was asked, as a machine-readable time with a visible age", () => {
    const el = draw(ok(FACTS));
    expect(el.textContent).toContain("indexer.onyx.testnets.gno.land");
    const time = el.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(SOURCE.at);
    expect(time?.textContent).toBe("2026-10-31 06:00 UTC");
  });

  it("leaves out a fact the indexer did not give, label and value, and shows no zero in its place", () => {
    const el = draw(ok({ path: FACTS.path, deployer: FACTS.deployer }));
    expect(valueOf(el, "First block")).toBeNull();
    expect([...el.querySelectorAll("dd")].map((node) => node.textContent)).toEqual([FACTS.path, FACTS.deployer]);
  });

  it("sets the realm's and the account's words left to right, and the numbers as they are", () => {
    const el = draw(ok(FACTS));
    expect(valueOf(el, "Path")?.getAttribute("dir")).toBe("ltr");
    expect(valueOf(el, "Deployer")?.getAttribute("dir")).toBe("ltr");
    expect(valueOf(el, "First block")?.hasAttribute("dir")).toBe(false);
  });

  it("shows a real block 0 as a 0 under its own label", () => {
    const el = draw(ok({ ...FACTS, firstBlock: 0 }));
    expect(valueOf(el, "First block")?.textContent).toBe("0");
  });

  it.each(FAILURE_KINDS)("shows a failed read of kind %s as its next step, the source and no fact", (kind) => {
    const next = `The next step for ${kind}.`;
    const el = draw({ ok: false, failure: { kind, next }, source: SOURCE });
    expect(el.querySelector("[role='alert'], [role='status']")?.textContent).toContain(next);
    expect(el.textContent).toContain("indexer.onyx.testnets.gno.land");
    expect(el.querySelector("time")?.getAttribute("datetime")).toBe(SOURCE.at);
    for (const label of LABELS) expect(valueOf(el, label)).toBeNull();
    expect(el.querySelector("dd")).toBeNull();
  });

  it("draws a hostile path or deployer as text, each in its own left-to-right element, and creates no element from it", () => {
    const hostile = "<img src=x onerror=alert(1)><script>alert(2)</script>\u202e";
    const el = draw(ok({ ...FACTS, path: hostile, deployer: hostile }));
    expect(el.querySelector("img, script")).toBeNull();
    for (const label of ["Path", "Deployer"]) {
      const value = valueOf(el, label);
      expect(value?.textContent).toBe(hostile);
      expect(value?.getAttribute("dir")).toBe("ltr");
    }
  });

  it("draws nothing for a read that gave no fact at all", () => {
    const el = draw(ok({}));
    for (const label of LABELS) expect(valueOf(el, label)).toBeNull();
    expect(el.textContent).not.toMatch(/path|deployer|first block|24 ?h/i);
  });
});
