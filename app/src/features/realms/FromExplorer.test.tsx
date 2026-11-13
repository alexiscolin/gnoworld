// @vitest-environment jsdom
import { shortAddress } from "@gnoworld/schemas";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainRead } from "@gnoworld/chain/read";
import { explorerLink } from "../../lib/chain/explorer.ts";
import { all, mount, noMedia, settled } from "../../../tests/mount.tsx";
import FromExplorer from "./FromExplorer.tsx";

// A world's realm card (8g, frame 93): the facts the indexer read and the file holds, each left out when no source gave it, never a zero;
// the read's source, or its failure as a status; the explorer's link and the docs'.
const read = vi.hoisted((): { value: unknown } => ({ value: undefined }));
vi.mock("../../lib/chain/indexer.ts", () => ({ readRealmFacts: () => Promise.resolve(read.value) }));

const SOURCE = { url: "https://indexer.example.test/graphql/query", at: "2026-11-05T06:00:00.000Z" };
// A realm of its own for each test: the facts of a realm are read once a session and kept (useRealmFacts's `held`, D530).
let VIEW = "";
let REALM = "";
let runs = 0;
const DEPLOYER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const fileOf = (path: string): Worlds["worlds"] => [
  {
    id: "gnoland/wugnot",
    namespace: "gnoland",
    realms: [
      {
        path,
        deployer: null,
        deployerName: "gnoland",
        functions: [],
        imports: [],
        calls: 1234,
        callers: null,
        lastHeight: 790123,
      },
    ],
  },
];
let FILE: Worlds["worlds"] = [];
const said = (value: ChainRead<unknown>) => {
  read.value = value;
};

beforeEach(() => {
  runs += 1;
  VIEW = `/r/gnoland/wugnot${String(runs)}`;
  REALM = `gno.land${VIEW}`;
  FILE = fileOf(REALM);
  noMedia();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const drawn = async (worlds: Worlds["worlds"] | undefined, waits: string) => {
  const box = mount(<FromExplorer view={VIEW} worlds={worlds} />);
  await settled(() => box.textContent.includes(waits));
  return box;
};
const label = (box: HTMLElement, name: string) =>
  all(box, "dt").find((term) => term.textContent === name)?.nextElementSibling?.textContent;
const outs = (box: HTMLElement) => all(box, "a[target='_blank']").map((link) => link.getAttribute("href"));

describe("a world's realm card", () => {
  it("shows the deployer, the block and the last call's block with the read's source, and links the explorer", async () => {
    said({ ok: true, value: { path: REALM, deployer: DEPLOYER, firstBlock: 786661 }, source: SOURCE });
    const box = await drawn(FILE, "Read from");
    expect(label(box, "Deployed by")).toBe("gnoland");
    expect(label(box, "Since block")).toBe((786661).toLocaleString("en-US"));
    // The calls are the plate's figure now (D399), the card holds the block of the last one.
    expect(label(box, "Last call at block")).toBe((790123).toLocaleString("en-US"));
    expect(box.textContent).not.toContain("Calls · all time");
    expect(box.textContent).toContain("indexer.example.test");
    expect(outs(box)).toEqual([explorerLink("onyx-1", REALM), "https://docs.gno.land/"]);
  });

  it("leaves out each fact no source gave, a zero never standing for it", async () => {
    said({ ok: true, value: { path: REALM }, source: SOURCE });
    const box = await drawn(undefined, "Read from");
    expect(all(box, "dt")).toEqual([]);
    expect(box.textContent).not.toMatch(/\b0\b/);
  });

  it("falls back to the file's deployer, by its short address when it names none", async () => {
    said({ ok: true, value: { path: REALM }, source: SOURCE });
    const file = structuredClone(FILE);
    for (const realm of file.flatMap((world) => world.realms))
      Object.assign(realm, { deployer: DEPLOYER, deployerName: null });
    const box = await drawn(file, "Read from");
    expect(label(box, "Deployed by")).toBe(shortAddress(DEPLOYER));
  });

  // D534: the page's one error line is the Render card's, so a failed read says nothing in this card.
  it("says nothing of a failed read, and keeps the file's facts and the links", async () => {
    const next = "The indexer did not answer; try again in a minute.";
    said({ ok: false, failure: { kind: "down", next }, source: SOURCE });
    const box = await drawn(FILE, "Last call at block");
    expect(box.textContent).not.toContain(next);
    expect(box.querySelector("[role='status'], [role='alert']")).toBeNull();
    expect(label(box, "Last call at block")).toBe((790123).toLocaleString("en-US"));
    expect(outs(box)).toHaveLength(2);
  });

  it("draws nothing for a view that names no realm", () => {
    expect(mount(<FromExplorer view="/w/bubble" worlds={undefined} />).textContent).toBe("");
  });
});
