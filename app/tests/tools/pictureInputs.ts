// What a world's picture in the chat's column is made from, and whether the pictures on disk still match it (the capture is
// planetPictures.spec.ts, kept out of the gate's journeys: its own config). Read by the capture, which writes the manifest, and by a unit test.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EARTH, hubWorldOf } from "@gnoworld/core";
import { z } from "zod";
import { mapNamesOf, worldOf } from "../../src/space/planet/generated.ts";
import { mapUrl } from "../../src/space/planet/mapUrl.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
/** The folder of the pictures, ending in a slash, and the manifest the site's code imports. */
export const PICTURES = here("../../public/world-pictures/");
export const MANIFEST = here("../../src/lib/worldPictures.json");
export const RERUN =
  "node app/node_modules/@playwright/test/cli.js test -c app/playwright.pictures.config.ts planetPictures";

const Manifest = z.record(z.string(), z.string());
const Hubs = z.array(z.object({ slug: z.string(), realms: z.array(z.string()).optional() }));
const EARTH_MAPS = ["earth-day", "earth-night", "clouds"];
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** The worlds the column shows, the Earth first: each hub's world, once. */
export function worldIds(): string[] {
  const hubs = Hubs.parse(JSON.parse(readFileSync(here("../../data/hubs.json"), "utf8")));
  return [...new Set([EARTH, ...hubs.map(hubWorldOf)])];
}

/** A hash of what the world's look is made from: its seed, class and palette, its texture files, and the code that frames it. */
export function inputsHash(id: string): string {
  const names = id === EARTH ? EARTH_MAPS : mapNamesOf(worldOf(id));
  const parts = [
    id === EARTH ? id : JSON.stringify(worldOf(id)),
    ...names.map((name) => sha(readFileSync(here(`../../public${mapUrl(name, "/")}`)))),
    sha(readFileSync(here("../../src/space/portraits.ts"))),
  ];
  return sha(new TextEncoder().encode(parts.join("|"))).slice(0, 8);
}

/** The manifest on disk: per world, the hash of the inputs its picture was taken from. */
const manifestOnDisk = () => Manifest.parse(JSON.parse(readFileSync(MANIFEST, "utf8")));

/** The worlds whose picture is missing or was taken from other inputs than the data now gives. */
export function staleWorlds(
  ids: readonly string[] = worldIds(),
  hashOf: (id: string) => string = inputsHash,
  manifest: z.infer<typeof Manifest> = manifestOnDisk(),
): { id: string; why: string }[] {
  return ids.flatMap((id) => {
    const held = manifest[id];
    if (held === undefined) return [{ id, why: "no picture" }];
    return held === hashOf(id) ? [] : [{ id, why: "its look changed" }];
  });
}
