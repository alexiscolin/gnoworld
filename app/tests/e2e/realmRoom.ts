import { readFileSync } from "node:fs";
import { realmRoom } from "@gnoworld/core";
import { z } from "zod";
import { expect, hydrated, type Page } from "./fixtures.ts";

// The universe's hubs as the data holds them: a realm a hub names takes the hub's world for its room.
const HUBS = z
  .array(z.object({ slug: z.string(), realms: z.array(z.string()).optional() }))
  .parse(JSON.parse(readFileSync(new URL("../../data/hubs.json", import.meta.url), "utf8")));

/** Whether the page is at a phone's width (under 900 px, the one breakpoint of the phone app). */
export const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 1280) < 900;

/**
 * The room list the server gives for `realm`'s world, holding the realm's own room: a realm's page asks it before anything else (its
 * room is made on the first open, which the e2e server cannot do without the real chain), and a phone shows nothing of the realm
 * but "Out of reach" while it is missing, since the full chat is all a phone has.
 */
export async function realmRoomListed(page: Page, realm: string): Promise<void> {
  const { world, room } = realmRoom(realm, HUBS);
  await page.route("**/api/rooms?*", (route) =>
    new URL(route.request().url()).searchParams.get("world") === world
      ? route.fulfill({ json: { world, sections: [{ name: null, rooms: [{ room, type: "open" }] }] } })
      : route.fallback(),
  );
}

/** A phone's page sheet: the dialog Info opens with "Its page", the one that goes back to Info. */
export const pageSheet = (page: Page) =>
  page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Back to Info" }) });

/** A phone's full chat of a place with the page sheet open on its page: Info, then "Its page". */
export async function openPageSheet(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Info/ }).click();
  await page.getByRole("dialog", { name: "Info" }).getByRole("button", { name: "Its page" }).click();
  await expect(pageSheet(page)).toBeVisible();
}

/**
 * A place's page where the screen has it: the page itself on a computer; on a phone its full chat with the page sheet open (a realm's
 * room listed first, so the chat opens). `realm` is the realm's path when the place is a realm's, which a phone's chat needs.
 */
export async function openPlacePage(page: Page, path: string, realm?: string): Promise<void> {
  const phone = isPhone(page);
  if (phone && realm !== undefined) await realmRoomListed(page, realm);
  await page.goto(path);
  await hydrated(page);
  if (phone) await openPageSheet(page);
}
