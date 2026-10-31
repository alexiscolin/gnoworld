// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { all, click, faceOf, follows, mount, nth, one } from "../../../tests/mount.tsx";
import { People } from "./People.tsx";

// 5q: "Here now" as the video's info panel draws it (frame 23.58.01): each person's nebula, their name, a rule under each row. The list and the way to write to a person stay (4e): the
// whole face and name is one button, named "Message" and the address, which opens the conversation.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const people = (over: Partial<Parameters<typeof People>[0]> = {}) =>
  mount(<People members={[ALICE, BOB]} connected me={undefined} onMessage={undefined} {...over} />);

describe("who is here, as the info panel shows it", () => {
  it("draws a nebula before each account's name, decorative since the name says who it is, a face of its own", () => {
    const rows = all(people(), "li");
    const faces = rows.map((row) => one(row, "[data-kind='person']"));
    for (const [at, row] of rows.entries()) {
      const face = nth(faces, at);
      expect(face.getAttribute("aria-hidden")).toBe("true");
      expect(all(face, "svg circle").length).toBeGreaterThan(0);
      expect(follows(face, one(row, "[title]"))).toBe(true);
    }
    expect(faceOf(nth(faces, 0))).not.toBe(faceOf(nth(faces, 1)));
    expect(faceOf(one(nth(all(people(), "li"), 0), "[data-kind='person']"))).toBe(faceOf(nth(faces, 0)));
  });

  it("shows a guest by the night disc, never a face an address would draw", () => {
    const row = one(people({ members: ["guest-ab12cd"] }), "li");
    expect(all(row, "svg circle")).toHaveLength(0);
    expect(all(row, "svg")).toHaveLength(1);
  });

  it("keeps the count for a screen reader, the bot left out, and a button to write to each other account", () => {
    const box = people({ members: ["gnoworld", ALICE, BOB], me: BOB, onMessage: () => undefined });
    expect(one(box, "h3").textContent).toBe("2 here");
    expect(one(box, "h3").className).toBe("visually-hidden");
    expect(all(box, "button")).toHaveLength(1);
  });

  it("makes a person's face and name one button, named by its word and the address, which opens the conversation", () => {
    const onMessage = vi.fn();
    const box = people({ me: BOB, onMessage });
    const row = nth(all(box, "li"), 0);
    const writes = one(row, "button");
    expect(writes.textContent).toBe("Message g10gh7…3y5tv");
    expect(all(writes, "[data-kind='person']")).toHaveLength(1);
    click(writes);
    expect(onMessage).toHaveBeenCalledWith(ALICE);
    expect(all(nth(all(box, "li"), 1), "button")).toHaveLength(0);
  });
});
