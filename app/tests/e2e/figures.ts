// The live figures a look journey draws, fixed: the journeys share one stack, so what other journeys leave in it must not reach a picture.
import { Presence } from "@gnoworld/schemas/indexer";
import type { BrowserContext, Page } from "@playwright/test";

const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// Who is here (/api/presence): the worlds the server lists, none with anyone but Bubble's three. A world's hours: Bubble's end on 11:00
// UTC, so the plate's peak reads the same each run; every other world answers as a server that never read it (the approved Earth's flat chart).
export async function pinFigures(context: BrowserContext): Promise<void> {
  await context.route("**/api/presence", async (route) => {
    const { worlds } = Presence.parse(await (await route.fetch()).json());
    const counted = (world: string) => ({ world, here: world === "bubble" ? 3 : 0, perHour: 0, rise: null });
    await route.fulfill(json({ worlds: [...new Set([...worlds.map(({ world }) => world), "bubble"])].map(counted) }));
  });
  await context.route("**/api/presence/hours*", (route) =>
    route.fulfill(
      new URL(route.request().url()).searchParams.get("world") === "bubble"
        ? json({ from: Date.UTC(2026, 9, 31, 12), hours: Array.from({ length: 24 }, (_, at) => 8 * at), now: 204 })
        : { status: 404, ...json({ error: "not_ready" }) },
    ),
  );
}

/** Closes the arrival's pill, which lives five seconds and says today's stop (a page opened straight on the full chat has none): a picture takes neither its time nor its day. */
export async function calmed(page: Page): Promise<void> {
  const close = page.locator("[data-banner]").getByRole("button", { name: "Close" });
  if ((await close.count()) > 0) await close.click();
}
