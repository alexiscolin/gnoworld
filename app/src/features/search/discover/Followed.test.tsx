// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { mount } from "../../../../tests/mount.tsx";
import type { SearchItem } from "../types.ts";
import { Followed } from "./Followed.tsx";

const world: SearchItem = { name: "alice/blog", kind: "world", universe: "onyx", path: "/w/alice/blog" };
const draw = (ranked: boolean, worlds: SearchItem[] = [world]) =>
  mount(
    <MemoryRouter>
      <Followed worlds={worlds} ranked={ranked} sort="trend" go={() => undefined} />
    </MemoryRouter>,
  ).textContent;
const rank = (calls: number): NonNullable<SearchItem["rank"]> => ({
  name: "blog",
  path: "gno.land/r/alice/blog",
  rise: 0,
  lastHeight: 1,
  firstHeight: 1,
  callers: 1,
  calls,
});

describe("the followed worlds", () => {
  it("say no realm is in the file only once the file has come", () => {
    expect(draw(false)).not.toContain("No realm in the file yet");
    expect(draw(true)).toContain("No realm in the file yet");
  });

  it("count the worlds, and a world's realms and calls, singular for one", () => {
    const one = { ...world, realmCount: 1, rank: rank(2) };
    const two = { ...world, name: "bob/blog", path: "/w/bob/blog", realmCount: 3, rank: rank(1) };
    expect(draw(true, [one])).toContain("1 world");
    const both = draw(true, [one, two]);
    expect(both).toContain("2 worlds");
    expect(both).toContain("1 realm · 2 calls");
    expect(both).toContain("3 realms · 1 call");
  });
});
