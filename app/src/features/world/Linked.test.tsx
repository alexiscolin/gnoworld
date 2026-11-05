// @vitest-environment jsdom
import { hubWorldOf } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { describe, expect, it } from "vitest";
import { all, mount } from "../../../tests/mount.tsx";
import type { Listed } from "../../places.ts";
import Linked from "./Linked.tsx";

// A world's connected worlds (8g, frames 26, 93, 104), from the worlds' file: the worlds whose realms import this world's first, then
// those its realms import; a hub named and linked as its page, any other world by its id's last segment and its first realm's view;
// four at most, nothing for a world the file does not link.
type Held = Worlds["worlds"][number];
const realmOf = (path: string, imports: string[] = []): Held["realms"][number] => ({
  path,
  deployer: null,
  deployerName: null,
  functions: [],
  imports,
  calls: null,
  callers: null,
  lastHeight: null,
});
const worldOf = (id: string, ...realms: Held["realms"]): Held => ({
  id,
  namespace: id.split("/")[0] ?? id,
  realms,
});
const hubOf = (slug: string, name: string, realm: string): Listed => ({
  slug,
  name,
  description: "",
  universe: "onyx",
  testnet: true,
  path: `/net/onyx/w/${slug}`,
  canonical: `/net/onyx/w/${slug}`,
  realms: [realm],
});
const rows = (box: HTMLElement) => all(box, "a").map((link) => [link.getAttribute("href"), link.textContent] as const);

const ME = "gno.land/r/me/app";

describe("a world's connected worlds", () => {
  it("lists the callers first, then the worlds it calls, each by its own words", () => {
    const worlds = [
      worldOf("me", realmOf(ME, ["gno.land/r/zed/lib"])),
      worldOf("amy", realmOf("gno.land/r/amy/app", [ME])),
      worldOf("zed", realmOf("gno.land/r/zed/lib")),
    ];
    const found = rows(mount(<Linked id="me" worlds={worlds} hubs={[]} prefix="" />));
    expect(found).toEqual([
      ["/r/amy/app", expect.stringContaining("amy calls this realm")],
      ["/r/zed/lib", expect.stringContaining("Calls zed")],
    ]);
  });

  it("names and links a hub as its page, and a world no hub holds in its universe's prefix", () => {
    const worlds = [
      worldOf("me", realmOf(ME, ["gno.land/r/memba/dao", "gno.land/r/zed/lib"])),
      worldOf("memba/dao", realmOf("gno.land/r/memba/dao")),
      worldOf("zed", realmOf("gno.land/r/zed/lib")),
    ];
    const hub = hubOf("memba-dao", "Memba DAO", "gno.land/r/memba/dao");
    expect(hubWorldOf(hub)).toBe("memba/dao");
    const found = rows(mount(<Linked id="me" worlds={worlds} hubs={[hub]} prefix="/net/onyx" />));
    expect(found).toEqual([
      ["/net/onyx/w/memba-dao", expect.stringContaining("Calls Memba DAO")],
      ["/net/onyx/r/zed/lib", expect.stringContaining("Calls zed")],
    ]);
  });

  it("shows four at most, and leaves out a world with no page to go to", () => {
    const names = ["a", "b", "c", "d", "e", "f"];
    const many = [
      worldOf(
        "me",
        realmOf(
          ME,
          names.map((name) => `gno.land/r/${name}/x`),
        ),
      ),
      ...names.map((name) => worldOf(name, realmOf(`gno.land/r/${name}/x`))),
    ];
    expect(rows(mount(<Linked id="me" worlds={many} hubs={[]} prefix="" />))).toHaveLength(4);
    const bare = [worldOf("me", realmOf(ME, ["gno.land/r/b/x"])), worldOf("b")];
    expect(mount(<Linked id="me" worlds={bare} hubs={[]} prefix="" />).textContent).toBe("");
  });

  it("draws nothing for a world the file does not hold", () => {
    const worlds = [worldOf("amy", realmOf("gno.land/r/amy/app"))];
    expect(mount(<Linked id="me" worlds={worlds} hubs={[]} prefix="" />).textContent).toBe("");
  });
});
