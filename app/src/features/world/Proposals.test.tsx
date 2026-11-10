// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { queryEnvelope } from "@gnoworld/chain/testing/envelopes";
import { mount } from "../../../tests/mount.tsx";
import { quietFreshQueries } from "../../../tests/queries.ts";
import type { ChainFetch, ChainRead } from "@gnoworld/chain/read";
import type { Proposal } from "../../lib/chain/proposal.ts";
import { HOME, PATH } from "../../../tests/govdaoFixtures.ts";
import Proposals from "./Proposals.tsx";

// A world's proposals (5k): the realm's home page as RECORDED on onyx-1 states no threshold, so no ring and no "of 66.66%"; a failed read says its
// state and links to gnoweb; a ring comes only from a tally, invented here.
// A read ends, then the query tells its readers a timer later: two turns.
const turns = async () => {
  await new Promise((done) => setTimeout(done, 0));
  await new Promise((done) => setTimeout(done, 0));
};
const flush = () => act(turns);

function answering(response: () => Response) {
  return vi.fn<ChainFetch>(() => Promise.resolve(response()));
}

// The block again, its realm's proposals read as `value`.
async function readingAs(value: Proposal[]) {
  vi.resetModules();
  await quietFreshQueries();
  vi.doMock("../../lib/chain/proposal.ts", async (original) => ({
    ...(await original<typeof import("../../lib/chain/proposal.ts")>()),
    readProposals: (): Promise<ChainRead<Proposal[]>> =>
      Promise.resolve({
        ok: true,
        value,
        source: { url: "https://rpc.onyx.testnets.gno.land:443", at: "2026-10-31T06:00:00.000Z" },
      }),
  }));
  return (await import("./Proposals.tsx")).default;
}

// Its proposals read as one that gave its tally, invented: no recorded page has one.
const tallied = () => readingAs([{ id: 15, title: "A proposal", state: "active", yes: 33, threshold: 66.66 }]);

// Its newest proposal accepted and the one before open, read with its yes and no as gnoland-1's #14 states them.
const opened = () =>
  readingAs([
    { id: 15, title: "Set node halt height", state: "ACCEPTED" },
    { id: 14, title: "Add valoper lurien to the valset", state: "ACTIVE", yes: 33.33333333333333, no: 0 },
  ]);

describe("a world's proposals", () => {
  it("rings the open proposal, not the newest, with its yes and no and no mark, and its pill says them (F4308)", async () => {
    const Open = await opened();
    const onRing = vi.fn();
    const el = mount(<Open path={PATH} onRing={onRing} />);
    await flush();
    expect(el.querySelector("[role='status']")?.textContent).toBe("Proposal 14 · YES 33% · NO 0%");
    expect(onRing).toHaveBeenLastCalledWith({ lit: 33.33333333333333 / 100, against: 0 });
    vi.doUnmock("../../lib/chain/proposal.ts");
  });

  it("draws the newest three as rows of the Proposals card, each a link to gnoweb, and no pill and no tally when none is open", async () => {
    const el = mount(
      <Proposals
        path={PATH}
        options={{ fetch: answering(() => new Response(JSON.stringify(queryEnvelope({ data: HOME })))) }}
      />,
    );
    await flush();
    expect(el.querySelector("h2")?.textContent).toBe("Proposals");
    expect(el.querySelector("[role='status']")).toBeNull();
    expect([...el.querySelectorAll("[data-link] .truncate")].map((h) => h.textContent)).toEqual([
      "Set validator gno-core-validator-1 to voting power 60",
      "Set validator gno-core-validator-1 to voting power 500",
      "Set node halt height",
    ]);
    expect(el.querySelector("a[href='https://onyx.testnets.gno.land/r/gov/dao:37']")).not.toBeNull();
    expect(el.textContent).not.toMatch(/YES|66\.66/);
  });

  it("hands the page no ring for a proposal that gave no tally", async () => {
    const onRing = vi.fn();
    mount(
      <Proposals
        path={PATH}
        onRing={onRing}
        options={{ fetch: answering(() => new Response(JSON.stringify(queryEnvelope({ data: HOME })))) }}
      />,
    );
    await flush();
    expect(onRing).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("hands the page no ring of the last realm while another's read is on its way (7e's review, B1-2)", async () => {
    vi.resetModules();
    await quietFreshQueries();
    const read = vi
      .fn<() => Promise<ChainRead<Proposal[]>>>()
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: 15, title: "A proposal", state: "active", yes: 33, threshold: 66.66 }],
        source: { url: "https://rpc.example", at: "2026-10-31T06:00:00.000Z" },
      })
      .mockReturnValue(new Promise(() => undefined));
    vi.doMock("../../lib/chain/proposal.ts", async (original) => ({
      ...(await original<typeof import("../../lib/chain/proposal.ts")>()),
      readProposals: read,
    }));
    const { default: Moving } = await import("./Proposals.tsx");
    const onRing = vi.fn();
    const box = document.createElement("div");
    const root = createRoot(box);
    act(() => {
      root.render(<Moving path="/r/gov/dao" onRing={onRing} />);
    });
    await flush();
    expect(onRing).toHaveBeenLastCalledWith({ lit: 0.33, mark: 0.6666 });
    act(() => {
      root.render(<Moving path="/r/bubble" onRing={onRing} />);
    });
    await flush();
    expect(onRing).toHaveBeenLastCalledWith(undefined);
    expect(box.textContent).not.toContain("Proposal 15");
    act(() => {
      root.unmount();
    });
    vi.doUnmock("../../lib/chain/proposal.ts");
  });

  it("takes its ring back from the page when the read fails, and when it leaves", async () => {
    const onRing = vi.fn();
    const failed = mount(
      <Proposals
        path={PATH}
        onRing={onRing}
        options={{ fetch: answering(() => new Response("down", { status: 503 })) }}
      />,
    );
    await flush();
    expect(onRing).toHaveBeenLastCalledWith(undefined);
    expect(failed.textContent).not.toContain("YES");
    const Tallied = await tallied();
    const leaving = vi.fn();
    const root = createRoot(document.createElement("div"));
    act(() => {
      root.render(<Tallied path={PATH} onRing={leaving} />);
    });
    await flush();
    expect(leaving).toHaveBeenLastCalledWith({ lit: 0.33, mark: 0.6666 });
    act(() => {
      root.unmount();
    });
    expect(leaving).toHaveBeenLastCalledWith(undefined);
    vi.doUnmock("../../lib/chain/proposal.ts");
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

  it("hands the page the ring of a proposal that gave its tally, and draws the words of it", async () => {
    const Tallied = await tallied();
    const onRing = vi.fn();
    const el = mount(<Tallied path={PATH} onRing={onRing} />);
    await flush();
    expect(el.querySelector("[role='status']")?.textContent).toBe("Proposal 15 · YES 33% of 66.66%");
    // 7e: the ring is the scene's tilted orbit, never a flat one on the plate (decision of 2026-10-31): the page hands it the tally.
    expect(el.querySelector("svg[role='img'], circle, path[stroke-dasharray]")).toBeNull();
    expect(onRing).toHaveBeenCalledExactlyOnceWith({ lit: 0.33, mark: 0.6666 });
    vi.doUnmock("../../lib/chain/proposal.ts");
  });
});
