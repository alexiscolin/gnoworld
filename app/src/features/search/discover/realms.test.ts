import { describe, expect, it } from "vitest";
import type { SearchItem } from "../types.ts";
import { realmChat } from "./realms.ts";

const realm = (path: string): SearchItem => ({ name: "mint", kind: "realm", universe: "onyx", path });

describe("realmChat", () => {
  it("opens a realm's own room, full, where it has a page: never the Earth's", () => {
    expect(realmChat(realm("/r/g1jz6j9h/sinopia3/mint/v1"), "/earth")).toBe("/r/g1jz6j9h/sinopia3/mint/v1?chat=full");
  });

  it("falls back to its world's or the Earth's where it has no page of its own", () => {
    expect(realmChat(realm("gno.land/r/demo/x"), "/w/bubble")).toBe("/w/bubble");
  });
});
