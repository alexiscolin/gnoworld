import { describe, expect, it, vi } from "vitest";
import { dropLink, takeLink } from "./pageLink.ts";

// The page's one link, shared by the panels drawn one after the other: each made link is a stand-in that counts its stops.
const made = vi.hoisted(() => [] as { stop: ReturnType<typeof vi.fn> }[]);
vi.mock("./link.ts", () => ({
  chatLink: () => {
    const link = { stop: vi.fn() };
    made.push(link);
    return link;
  },
}));

const store = (): Parameters<typeof takeLink>[0] => ({}) as Parameters<typeof takeLink>[0];
const aTask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the page's link", () => {
  it("stays the same link, never stopped, when a panel lets it go and the next takes it in the same commit", async () => {
    const page = store();
    const first = takeLink(page);
    dropLink();
    const next = takeLink(page);
    await aTask();
    expect(next).toBe(first);
    expect(made.at(-1)?.stop).not.toHaveBeenCalled();
    dropLink();
    await aTask();
  });

  it("stops once no panel holds it after the commit, and the next panel takes a new one", async () => {
    const page = store();
    const first = takeLink(page);
    dropLink();
    await aTask();
    expect(made.at(-1)?.stop).toHaveBeenCalledOnce();
    expect(takeLink(page)).not.toBe(first);
    dropLink();
    await aTask();
  });

  it("stops the last page's link when another store takes one", async () => {
    takeLink(store());
    const before = made.at(-1);
    takeLink(store());
    expect(before?.stop).toHaveBeenCalledOnce();
    dropLink();
    await aTask();
  });
});
