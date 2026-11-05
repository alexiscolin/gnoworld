// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { queryEnvelope } from "@gnoworld/chain/testing/envelopes";
import { mount } from "../../../tests/mount.tsx";
import type { ChainFetch, ChainRead } from "@gnoworld/chain/read";
import type { Proposal } from "../../lib/chain/proposal.ts";
import Proposals from "./Proposals.tsx";

// A world's proposals on its plate (5k): drawn from the realm's home page as RECORDED on onyx-1 (tests/chain/recorded), which
// states no threshold, so the page draws no "of 66.66%" and no ring; a read that fails says its state and links to gnoweb. The ring
// itself is drawn from a proposal that gave its tally, invented here: no recorded page has one.
const HOME = Object.values(
  import.meta.glob<string>("../../../tests/chain/recorded/onyx-1-gov-dao-home.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)
  .join("")
  .replace(/^<!--.*-->\n/, "");
const PATH = "/r/gov/dao";
const flush = () =>
  act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });

function answering(response: () => Response) {
  return vi.fn<ChainFetch>(() => Promise.resolve(response()));
}

describe("a world's proposals", () => {
  it("draws the newest proposal under its pill and the newest three as cards, each with its gnoweb link, and no tally", async () => {
    const el = mount(
      <Proposals
        path={PATH}
        options={{ fetch: answering(() => new Response(JSON.stringify(queryEnvelope({ data: HOME })))) }}
      />,
    );
    await flush();
    expect(el.querySelector("[role='status']")?.textContent).toBe("Proposal 37");
    expect([...el.querySelectorAll("h3")].map((h) => h.textContent)).toEqual([
      "Set validator gno-core-validator-1 to voting power 60",
      "Set validator gno-core-validator-1 to voting power 500",
      "Set node halt height",
    ]);
    expect(el.querySelector("a[href='https://onyx.testnets.gno.land/r/gov/dao:37']")).not.toBeNull();
    expect(el.textContent).not.toMatch(/YES|66\.66/);
    expect(el.querySelector("svg")).toBeNull();
  });

  it("says a realm lists no proposal when its page lists none", async () => {
    const el = mount(
      <Proposals
        path={PATH}
        options={{ fetch: answering(() => new Response(JSON.stringify(queryEnvelope({ data: "# GovDAO\n" })))) }}
      />,
    );
    await flush();
    expect(el.textContent).toContain("This realm lists no proposal.");
  });

  it("says its state while it reads", () => {
    const el = mount(<Proposals path={PATH} options={{ fetch: () => new Promise(() => undefined) }} />);
    expect(el.textContent).toContain("Reading the proposals");
  });

  it("says why when the chain does not answer, and links to the realm on gnoweb", async () => {
    const el = mount(
      <Proposals path={PATH} options={{ fetch: answering(() => new Response("down", { status: 503 })) }} />,
    );
    await flush();
    expect(el.querySelector("[role='alert']")?.textContent).toContain("did not answer");
    expect(el.querySelector("a[href='https://onyx.testnets.gno.land/r/gov/dao']")?.textContent).toBe(
      "Read them on gnoweb",
    );
    expect(el.querySelector("h3")).toBeNull();
  });

  it("draws the ring of a proposal that gave its tally, and the words of it", async () => {
    vi.resetModules();
    vi.doMock("../../lib/chain/proposal.ts", async (original) => ({
      ...(await original<typeof import("../../lib/chain/proposal.ts")>()),
      readProposals: (): Promise<ChainRead<Proposal[]>> =>
        Promise.resolve({
          ok: true,
          value: [{ id: 15, title: "A proposal", state: "active", yes: 33, threshold: 66.66 }],
          source: { url: "https://rpc.onyx.testnets.gno.land:443", at: "2026-10-31T06:00:00.000Z" },
        }),
    }));
    const { default: Tallied } = await import("./Proposals.tsx");
    const el = mount(<Tallied path={PATH} />);
    await flush();
    expect(el.querySelector("[role='status']")?.textContent).toBe("Proposal 15 · YES 33% of 66.66%");
    expect(el.querySelectorAll("svg circle")).toHaveLength(3);
    vi.doUnmock("../../lib/chain/proposal.ts");
  });
});
