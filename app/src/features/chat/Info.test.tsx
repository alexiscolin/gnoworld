// @vitest-environment jsdom
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { all, mount } from "../../../tests/mount.tsx";
import { Info } from "./Info.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
import { explorerLink } from "../../lib/chain/explorer.ts";

// The small view of space at the panel's top needs the store, the router and an engine: these are the links' tests, not its.
vi.mock("./PlaceView.tsx", () => ({ PlaceView: () => null }));

const place = (more: Partial<ChatPlace>): ChatPlace => ({
  slug: "x",
  name: "golf",
  description: "d",
  kicker: "k",
  home: "/",
  worlds: [],
  universe: { id: "onyx", isDefault: false, gnoweb: "https://onyx.example" },
  ...more,
});

const linksOf = (more: Partial<ChatPlace>, text: RegExp) =>
  all(
    mount(
      <Info
        place={place(more)}
        talking={undefined}
        room={undefined}
        people={null}
        panelRef={createRef()}
        buttons={null}
        close={null}
      />,
    ),
    "a",
  )
    .filter((link) => text.test(link.textContent))
    .map((link) => link.getAttribute("href"));
const gnoweb = (more: Partial<ChatPlace>) => linksOf(more, /gnoweb/i);
const explorer = (more: Partial<ChatPlace>) => linksOf(more, /explorer/i);

describe("the full chat's info links", () => {
  it("opens a realm's own page on gnoweb, never gnoweb's home (View on gnoweb of a realm's page)", () => {
    expect(gnoweb({ realm: "gno.land/r/ns/golf/v2" })).toEqual(["https://onyx.example/r/ns/golf/v2"]);
  });

  it("opens gnoweb itself for a place with no realm", () => {
    expect(gnoweb({})).toEqual(["https://onyx.example"]);
  });

  it("links the explorer on the universe's own network, as the plates do", () => {
    expect(explorer({})).toEqual([explorerLink("onyx-1")]);
    expect(explorer({ universe: { id: "gnoland", isDefault: true, gnoweb: "https://gno.land" } })).toEqual([
      explorerLink("gnoland-1"),
    ]);
  });

  it("links no explorer for a universe whose chain it does not list", () => {
    expect(explorer({ universe: { id: "elsewhere", isDefault: false, gnoweb: undefined } })).toEqual([]);
  });
});
