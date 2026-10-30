// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { all, faceOf, follows, mount, nth, one, staysText } from "../../../tests/mount.tsx";
import { People } from "./People.tsx";

// 5q: "Here now" as the video's info panel draws it (frame 23.58.01): each person's nebula, their name, their country at
// the end of the row when they opted in. The list, its name and its Message buttons stay (4e).
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

  it("shows a country's tag and its name at the end of a row, for a person who opted in alone", () => {
    const rows = all(people({ countries: { [ALICE]: { code: "NG", name: "Nigeria" } } }), "li");
    expect(nth(rows, 0).textContent).toContain("Nigeria");
    expect(all(nth(rows, 0), "[data-country='NG']")).toHaveLength(1);
    expect(all(nth(rows, 1), "[data-country]")).toHaveLength(0);
  });

  it("reads the country of a member by its own key: a nick named like an object's own property draws no tag", () => {
    for (const nick of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const row = one(people({ members: [nick], countries: {} }), "li");
      expect(all(row, "[data-country]")).toHaveLength(0);
      expect(row.textContent).toContain(nick);
    }
  });

  it("keeps a country's words as text, whatever they hold or however long", () => {
    staysText((name) => (
      <People
        members={[ALICE]}
        connected
        me={undefined}
        onMessage={undefined}
        countries={{ [ALICE]: { code: "NG", name } }}
      />
    ));
  });

  it("keeps the count, the bot left out, and each other account's Message button", () => {
    const box = people({ members: ["gnoworld", ALICE, BOB], me: BOB, onMessage: () => undefined });
    expect(one(box, "h3").textContent).toBe("2 here");
    expect(all(box, "button")).toHaveLength(1);
  });
});
