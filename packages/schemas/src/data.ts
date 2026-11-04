// The data files' schemas (slice 5's 5c; ADR-0002 §8 row 10): the lists in app/data, checked when the app builds, so a
// malformed file stops the build. A list may be empty, but the universes'. Nothing here is trusted: a link is https and
// no more, a name in a path is a slug, every string and every list has a cap (DATA_CAPS), a duplicate is refused.
import { Slug } from "./slug.ts";
import { ExportedName } from "./worlds.ts";
import { z } from "./zod.ts";

/** The most a data file may hold: rows in a list, and each kind of string, in characters. */
export const DATA_CAPS = {
  rows: 1000,
  universes: 20,
  key: 40,
  name: 80,
  title: 120,
  description: 500,
  seoDescription: 160,
  link: 2048,
} as const;

export const text = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));

/** A name in a path, and the id of a universe: lower case, digits, single hyphens. */
export const Key = Slug.check(z.maxLength(DATA_CAPS.key));

/** A link: https alone, a host, no credentials, no space (a `javascript:`, `data:` or `http:` link never gets in). */
export const Link = z.string().check(z.maxLength(DATA_CAPS.link), z.regex(/^https:\/\/[^\s/?#@\\]+(?:[/?#]\S*)?$/));

/** An origin: https, a lower-case host and an optional port, no path, query, fragment or credentials (what a page's address is put under). */
const Origin = z
  .string()
  .check(z.maxLength(DATA_CAPS.link), z.regex(/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::[0-9]{1,5})?$/));

/** The players a news item may embed, each by its own path (F885: csp.ts's frame-src names the same prefixes). */
export const EMBED_PREFIXES = [
  "https://www.youtube-nocookie.com/embed/",
  "https://player.vimeo.com/video/",
  "https://giphy.com/embed/",
] as const;
const EMBED_ID = [/^[A-Za-z0-9_-]{11}$/, /^\d{1,12}$/, /^[A-Za-z0-9]{1,40}$/] as const;
const Embed = z
  .string()
  .check(
    z.refine(
      (embed) =>
        EMBED_PREFIXES.some((prefix, i) => embed.startsWith(prefix) && EMBED_ID[i]?.test(embed.slice(prefix.length))),
      "an embed is an accepted player's address",
    ),
  );

/** Rows may not repeat a key: the second names the field, as the message of the build does. */
function unique<T extends z.ZodMiniType>(rows: T, field: string, key: (row: never) => string) {
  return rows.check(
    z.check((ctx) => {
      const seen = new Set<string>();
      (ctx.value as never[]).forEach((row, index) => {
        const k = key(row);
        if (seen.has(k))
          ctx.issues.push({
            code: "custom",
            input: ctx.value,
            path: [index, field],
            message: `duplicate ${field} ${JSON.stringify(k)}`,
          });
        seen.add(k);
      });
    }),
  );
}

const list = <T extends z.ZodMiniType>(row: T) => z.array(row).check(z.maxLength(DATA_CAPS.rows));
export const byId = <T extends z.ZodMiniType>(row: T) => unique(list(row), "id", (r: { id: string }) => r.id);
const bySlug = <T extends z.ZodMiniType>(row: T) => unique(list(row), "slug", (r: { slug: string }) => r.slug);
const inUniverse = <T extends z.ZodMiniType>(row: T) =>
  unique(list(row), "slug", (r: { slug: string; universe: string }) => `${r.universe}/${r.slug}`);

/** A realm of a world, by its path on its universe's chain: the shape of gno's own (`gno.land/r/gov/dao`), at most 128 characters; the
 * cosmos's Plan links a world to its realm's view only by such a path (7v). */
export const RealmPath = z
  .string()
  .check(z.maxLength(128), z.regex(/^gno\.land\/r\/[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/));

const World = z.strictObject({
  slug: Key,
  name: text(DATA_CAPS.name),
  description: z.string().check(z.minLength(50), z.maxLength(DATA_CAPS.seoDescription)),
  universe: Key,
  /** The realms the world is about, the first the one its page reads proposals from (docs/decisions.md, 2026-10-30). */
  realms: z.optional(z.array(RealmPath).check(z.minLength(1), z.maxLength(5))),
});

export const Hubs = inUniverse(World);
export const Stations = inUniverse(World);
export const Ecosystems = inUniverse(
  z.strictObject({ slug: Key, name: text(DATA_CAPS.name), description: text(DATA_CAPS.description), universe: Key }),
);
export const Genres = bySlug(z.strictObject({ slug: Key, name: text(DATA_CAPS.name) }));
/** The start the data gives an event whose date is still to be confirmed: a sentinel at the start of 2099, never shown as a date. */
export const UNDATED_EVENT = Date.UTC(2099, 0, 1);

export const Events = byId(
  z.strictObject({
    id: text(DATA_CAPS.key),
    title: text(DATA_CAPS.title),
    start: z.iso.datetime(),
    link: Link,
    /** The world it happens in, by its hub's slug or the Earth's ("earth"), for the calendar and the bell by world (Alexis, slice 8). */
    world: z.optional(Key),
  }),
);
// A world as the expedition and the quests name it (slice 8): a hub or a station of the file's universe by its slug, or a realm by its path,
// never both; the build checks the slug against hubs.json and stations.json (app/src/dataFiles.ts).
const oneWorld = (row: { hub?: string | undefined; realm?: string | undefined }) =>
  (row.hub === undefined) !== (row.realm === undefined);

/** The pool of the daily expedition's stops (ADR-0002 §1, "Daily expedition"): each a world the team curates, a realm's with its name, with a
 * line on why to go; `live` marks a world where something moves every day, which the first stop of a day is chosen among (core's
 * `expeditionOf`). */
export const Expedition = byId(
  z
    .strictObject({
      id: Key,
      universe: Key,
      hub: z.optional(Key),
      realm: z.optional(RealmPath),
      name: z.optional(text(DATA_CAPS.name)),
      why: text(DATA_CAPS.title),
      live: z.optional(z.boolean()),
    })
    // A hub's name is hubs.json's, one source for the arrival's pill and the expedition; a realm's is the stop's.
    .check(
      z.refine(
        (stop) => oneWorld(stop) && (stop.realm === undefined) === (stop.name === undefined),
        "a hub, or a named realm",
      ),
    ),
);

/** The most steps a quest holds, and the fewest. */
const QUEST_STEPS = { min: 2, max: 8 } as const;

// A quest's step: a visit to a world, words said in a hub's main room, or a realm's call, which ends every quest (slice 9 signs it).
const Step = z
  .strictObject({
    id: Key,
    kind: z.enum(["visit", "talk", "call"]),
    title: text(DATA_CAPS.title),
    hub: z.optional(Key),
    realm: z.optional(RealmPath),
    function: z.optional(ExportedName),
  })
  .check(
    z.refine(
      (step) =>
        step.kind === "visit"
          ? oneWorld(step) && step.function === undefined
          : step.kind === "talk"
            ? step.hub !== undefined && step.realm === undefined && step.function === undefined
            : step.hub === undefined && step.realm !== undefined && step.function !== undefined,
      "a visit names a hub or a realm, a talk a hub, a call a realm and its function",
    ),
  );

/** Quests across worlds (ADR-0002 §1, "Quests"): steps in order, at least two, the last a realm's call; a reward that stays on the device. */
export const Quests = byId(
  z.strictObject({
    id: Key,
    universe: Key,
    title: text(DATA_CAPS.title),
    description: text(DATA_CAPS.description),
    reward: text(DATA_CAPS.name),
    steps: unique(
      z.array(Step).check(
        z.minLength(QUEST_STEPS.min),
        z.maxLength(QUEST_STEPS.max),
        z.refine((steps) => steps.at(-1)?.kind === "call", "a quest ends on a realm's call"),
      ),
      "id",
      (step: { id: string }) => step.id,
    ),
  }),
);

export { BubbleRules } from "./bubbleRules.ts";

const degrees = (limit: number) => z.number().check(z.gte(-limit), z.lte(limit));

/** Where the Earth's side rooms stand (ADR-0002 §10): one point of the globe a room, by a reviewed row, so no room's name finds a place by
 * chance. A room with none stays in the list; the main room is the globe itself. */
/** What turns round the Earth (7v; Alexis, 2026-11-03): a project the team adds by hand, even with no realm, by its name and its own
 * address, and the hub whose page it links to where it has one; a name once. */
export const EarthOrbit = unique(
  list(z.strictObject({ name: text(DATA_CAPS.name), url: Link, slug: z.optional(Key) })),
  "name",
  (r: { name: string }) => r.name,
);

export const EarthRooms = unique(
  list(
    z.strictObject({
      room: z.string().check(z.regex(/^#earth\/[a-z0-9]+(-[a-z0-9]+)*$/), z.maxLength("#earth/".length + 32)),
      lat: degrees(90),
      lon: degrees(180),
    }),
  ),
  "room",
  (r: { room: string }) => r.room,
);

export const News = byId(
  z.strictObject({
    id: text(DATA_CAPS.key),
    title: text(DATA_CAPS.title),
    date: z.iso.date(),
    link: Link,
    embed: z.optional(Embed),
  }),
);

const Universe = z.strictObject({
  id: Key,
  name: text(DATA_CAPS.name),
  chainId: text(DATA_CAPS.key),
  rpc: Link,
  /** The chain's gnoweb, the source of truth a realm's card and view link to (ADR-0002 §4): its origin. */
  gnoweb: Origin,
  /** The chain's public indexer: the address of its GraphQL endpoint. */
  indexer: Link,
  testnet: z.boolean(),
  default: z.optional(z.literal(true)),
});

/** The networks the site shows; exactly one is the build's default (docs/decisions.md, 2026-10-29: Onyx). */
export const Universes = z.array(Universe).check(
  z.maxLength(DATA_CAPS.universes),
  z.check((ctx) => {
    const ids = new Set<string>();
    const chains = new Set<string>();
    let defaults = 0;
    ctx.value.forEach((row, index) => {
      const issue = (field: string, message: string) =>
        ctx.issues.push({ code: "custom", input: ctx.value, path: [index, field], message });
      if (ids.has(row.id)) issue("id", `duplicate id ${JSON.stringify(row.id)}`);
      if (chains.has(row.chainId)) issue("chainId", `duplicate chainId ${JSON.stringify(row.chainId)}`);
      ids.add(row.id);
      chains.add(row.chainId);
      if (row.default === true && ++defaults > 1) issue("default", "a second default universe");
    });
    if (defaults === 0) ctx.issues.push({ code: "custom", input: ctx.value, message: "no universe is the default" });
  }),
);
