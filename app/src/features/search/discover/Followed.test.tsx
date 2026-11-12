// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { mount } from "../../../../tests/mount.tsx";
import type { SearchItem } from "../types.ts";
import { Followed } from "./Followed.tsx";

const world: SearchItem = { name: "alice/blog", kind: "world", universe: "onyx", path: "/w/alice/blog" };
const draw = (ranked: boolean) =>
  mount(
    <MemoryRouter>
      <Followed worlds={[world]} ranked={ranked} sort="trend" go={() => undefined} />
    </MemoryRouter>,
  ).textContent;

describe("the followed worlds", () => {
  it("say no realm is in the file only once the file has come", () => {
    expect(draw(false)).not.toContain("No realm in the file yet");
    expect(draw(true)).toContain("No realm in the file yet");
  });
});
