import type { Presence } from "@gnoworld/schemas/indexer";
import { describe, expect, it, vi } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import { exploreTo } from "./explore.ts";

// "Go explore" (ADR-0003 §3): the world with the most people now, by the server's presence as the click comes, but never the Earth, which
// "Join the chat" and "Start here" lead to; the Earth when no world has anyone, or the server does not say.
const PLACES = {
  earth: "/earth",
  worlds: [
    { slug: "bubble", path: "/w/bubble" },
    { slug: "govdao", path: "/w/govdao" },
    { slug: "minichess", path: "/w/minichess" },
  ],
};
const here = (world: string, people: number) => ({ world, here: people, perHour: 0, rise: null });
const answered = (worlds: Presence["worlds"]) =>
  vi.fn(() => Promise.resolve<Result<Presence>>({ ok: true, value: { worlds } }));

describe("where Go explore goes", () => {
  it("goes to the world with the most people now", async () => {
    const read = answered([here("bubble", 3), here("govdao", 9), here("minichess", 4)]);
    await expect(exploreTo(PLACES, read)).resolves.toBe("/w/govdao");
    expect(read).toHaveBeenCalledOnce();
  });

  it("never goes to the Earth while a world has someone, however many the Earth holds", async () => {
    await expect(exploreTo(PLACES, answered([here("earth", 180), here("bubble", 1)]))).resolves.toBe("/w/bubble");
  });

  // F4520: a page that listed the Earth among its worlds, by its slug, still never sends Go explore there.
  it("never counts the Earth's slug as a world, should the page list it", async () => {
    const listed = { ...PLACES, worlds: [{ slug: "earth", path: "/earth" }, ...PLACES.worlds] };
    await expect(exploreTo(listed, answered([here("earth", 180), here("govdao", 1)]))).resolves.toBe("/w/govdao");
  });

  it("goes to the Earth when no world has anyone", async () => {
    await expect(exploreTo(PLACES, answered([here("earth", 12), here("bubble", 0)]))).resolves.toBe("/earth");
    await expect(exploreTo(PLACES, answered([]))).resolves.toBe("/earth");
  });

  it("goes to no world the page does not list: a slug of another universe, or none known", async () => {
    await expect(exploreTo(PLACES, answered([here("elsewhere", 50), here("minichess", 2)]))).resolves.toBe(
      "/w/minichess",
    );
    await expect(exploreTo(PLACES, answered([here("elsewhere", 50)]))).resolves.toBe("/earth");
  });

  it("breaks a tie by the page's own order of its worlds, whatever order the server answers in", async () => {
    await expect(exploreTo(PLACES, answered([here("minichess", 5), here("govdao", 5)]))).resolves.toBe("/w/govdao");
    await expect(exploreTo(PLACES, answered([here("govdao", 5), here("bubble", 5)]))).resolves.toBe("/w/bubble");
  });

  it("goes to the Earth when the server does not answer", async () => {
    const failed = vi.fn(() => Promise.resolve<Result<Presence>>({ ok: false, reason: "network" }));
    await expect(exploreTo(PLACES, failed)).resolves.toBe("/earth");
  });
});
