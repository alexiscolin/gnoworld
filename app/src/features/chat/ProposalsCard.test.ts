import { describe, expect, it } from "vitest";
import { listed } from "./ProposalsCard.tsx";

// the open proposals first, then the last three; a proposer's title is text, cleaned of hidden characters and cut.
const proposal = (id: number, state: string, title = `Proposal ${String(id)}`) => ({ id, title, state });

describe("the proposals card's list", () => {
  it("puts the open proposals apart and keeps the last three of the others, in the realm's order", () => {
    const all = [
      proposal(9, "ACTIVE"),
      proposal(8, "ACCEPTED"),
      proposal(7, "ACTIVE"),
      ...[6, 5, 4, 3].map((id) => proposal(id, "REJECTED")),
    ];
    const { open, last } = listed(all);
    expect(open.map(({ id }) => id)).toEqual([9, 7]);
    expect(last.map(({ id }) => id)).toEqual([8, 6, 5]);
  });

  it("is empty when no proposal is listed", () => {
    expect(listed([])).toEqual({ open: [], last: [] });
  });

  it("strips a hostile title of its bidi and hidden characters and cuts it", () => {
    const hostile = `\u202eevil\u200b title${"x".repeat(500)}`;
    const [only] = listed([proposal(1, "ACTIVE", hostile)]).open;
    expect(only?.title).not.toMatch(/[\u202e\u200b]/u);
    expect(only?.title.length).toBeLessThanOrEqual(120);
    expect(only?.title.startsWith("evil title")).toBe(true);
  });
});
