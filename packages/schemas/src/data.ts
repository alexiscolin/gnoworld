// The data files' schemas (slice 5's 5c; ADR-0002 §8 row 10): the lists in app/data, checked when the app builds, so a
// malformed file stops the build. A list may be empty, but the universes'. Nothing here is trusted: a link is https and
// no more, a name in a path is a slug, every string and every list has a cap (DATA_CAPS), a duplicate is refused.
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

const text = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));

/** A name in a path, and the id of a universe: lower case, digits, single hyphens. */
const Slug = z.string().check(z.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), z.maxLength(DATA_CAPS.key));

/** A link: https alone, a host, no credentials, no space (a `javascript:`, `data:` or `http:` link never gets in). */
const Link = z.string().check(z.maxLength(DATA_CAPS.link), z.regex(/^https:\/\/[^\s/?#@\\]+(?:[/?#]\S*)?$/));

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
const byId = <T extends z.ZodMiniType>(row: T) => unique(list(row), "id", (r: { id: string }) => r.id);
const bySlug = <T extends z.ZodMiniType>(row: T) => unique(list(row), "slug", (r: { slug: string }) => r.slug);
const inUniverse = <T extends z.ZodMiniType>(row: T) =>
  unique(list(row), "slug", (r: { slug: string; universe: string }) => `${r.universe}/${r.slug}`);

/** A realm of a world, by its path on its universe's chain: the shape of gno's own (`gno.land/r/gov/dao`), at most 128 characters. */
const RealmPath = z
  .string()
  .check(z.maxLength(128), z.regex(/^gno\.land\/r\/[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/));

const World = z.strictObject({
  slug: Slug,
  name: text(DATA_CAPS.name),
  description: z.string().check(z.minLength(50), z.maxLength(DATA_CAPS.seoDescription)),
  universe: Slug,
  /** The realms the world is about, the first the one its page reads proposals from (docs/decisions.md, 2026-10-30). */
  realms: z.optional(z.array(RealmPath).check(z.minLength(1), z.maxLength(5))),
});

export const Hubs = inUniverse(World);
export const Stations = inUniverse(World);
export const Ecosystems = inUniverse(
  z.strictObject({ slug: Slug, name: text(DATA_CAPS.name), description: text(DATA_CAPS.description), universe: Slug }),
);
export const Genres = bySlug(z.strictObject({ slug: Slug, name: text(DATA_CAPS.name) }));
export const Events = byId(
  z.strictObject({ id: text(DATA_CAPS.key), title: text(DATA_CAPS.title), start: z.iso.datetime(), link: Link }),
);
export const Expedition = byId(
  z.strictObject({
    id: text(DATA_CAPS.key),
    title: text(DATA_CAPS.title),
    description: text(DATA_CAPS.description),
    link: Link,
  }),
);
export const Quests = byId(
  z.strictObject({ id: text(DATA_CAPS.key), title: text(DATA_CAPS.title), description: text(DATA_CAPS.description) }),
);

const rule = (low: number, high: number) => z.int().check(z.gte(low), z.lte(high));

/** The rules of the Earth's bubbles (ADR-0001 §7), one object; each bound keeps a rule from drowning the globe. */
export const BubbleRules = z.strictObject({
  maxOnScreen: rule(1, 12),
  showSeconds: rule(1, 15),
  speakerDelaySeconds: rule(1, 120),
  maxChars: rule(20, 160),
  readLast: rule(1, 2000),
  maxAgeSeconds: rule(30, 86_400),
});

const degrees = (limit: number) => z.number().check(z.gte(-limit), z.lte(limit));

/** Where the Earth's side rooms stand (ADR-0002 §10): one point of the globe a room, by a reviewed row, so no room's name finds a place by
 * chance. A room with none stays in the list; the main room is the globe itself. */
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
  id: Slug,
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
