// The data files' schemas (slice 5's 5c; ADR-0002 §8 row 10): the lists in app/data, checked when the app builds, so a
// malformed file stops the build. A list may be empty, but the universes'. Nothing here is trusted: a link is https and
// no more, a name in a path is a slug, every string and every list has a cap (DATA_CAPS), a duplicate is refused.
import { Key, SLUG_CAP } from "./slug.ts";
import { z } from "./zod.ts";

export { Key, Slug } from "./slug.ts";

/** The most a data file may hold: rows in a list, and each kind of string, in characters. */
export const DATA_CAPS = {
  rows: 1000,
  universes: 20,
  key: SLUG_CAP,
  name: 80,
  title: 120,
  description: 500,
  seoDescription: 160,
  link: 2048,
} as const;

export const text = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));

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
export function unique<T extends z.ZodMiniType>(rows: T, field: string, key: (row: never) => string) {
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

/** The most a call's arguments may hold, as a Jarvis proposal and a world's pinned action give them, in code points. */
export const CALL_CAPS = { args: 16, name: 128, arg: 1000, label: 80 } as const;

/** A call's arguments by the parameter's name, as text: what a call carries, and what a model is shown of them. */
export const CallArgs = z
  .record(text(CALL_CAPS.name), z.string().check(z.maxLength(CALL_CAPS.arg)))
  .check(z.refine((args) => Object.keys(args).length <= CALL_CAPS.args, "too many arguments"));

// A team's arguments from a data file: Zod drops a key `__proto__` (an own key from JSON.parse) without a word, so its argument
// would vanish unseen; refused first. Not Jarvis's: a pipe shows a model no shape (jarvis/src/allowlist.ts's input schema).
const DataArgs = z.pipe(
  z
    .unknown()
    .check(
      z.refine(
        (args) => typeof args !== "object" || args === null || !Object.hasOwn(args, "__proto__"),
        "no argument is named __proto__",
      ),
    ),
  CallArgs,
);

// A label as a reader sees it: compatibility forms folded, what draws nothing gone (any default-ignorable code point: joiners,
// variation selectors, Hangul's fillers), any apostrophe one, spaces and the Braille blank one space, no case.
const labelKey = (label: string): string =>
  label
    .normalize("NFKC")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .replace(/[\u2018\u2019\u02bc\u0060\u00b4]/gu, "'")
    .replace(/[\s\u2800]+/gu, " ")
    .trim()
    .toLowerCase();

// A label drawn on a button that leads to a signature: words a reader sees as they are (no control, format or separator character,
// not blank), never read as the bar's own Who's here.
const Label = text(CALL_CAPS.label).check(
  z.refine((label) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(label), "a label holds no control or format character"),
  z.refine((label) => labelKey(label) !== "", "a label draws more than blank"),
  z.refine((label) => labelKey(label) !== "who's here", "a label is not the bar's Who's here"),
);

/** A call the team pins in a world (D271): the realm one of the world's own, checked against vm/qfuncs before it shows. */
const PinnedAction = z.strictObject({
  label: Label,
  realm: RealmPath,
  function: text(CALL_CAPS.name),
  args: DataArgs,
});

/** What a world of the data may be, as its plate's crumb says it. */
const WORLD_KINDS = ["hub", "dao", "dapp", "station"] as const;

const World = z
  .strictObject({
    slug: Key,
    name: text(DATA_CAPS.name),
    description: z.string().check(z.minLength(50), z.maxLength(DATA_CAPS.seoDescription)),
    universe: Key,
    /** The realms the world is about, the first the one its page reads proposals from (docs/decisions.md, 2026-10-30). */
    realms: z.optional(z.array(RealmPath).check(z.minLength(1), z.maxLength(5))),
    /** What the world is, its plate's crumb (8g, frames 22 and 104: "UNIVERSE › DAO", "UNIVERSE › GAMES › DAPP"): a hub unless the team says; a
     * station round the Earth (8l) is a world of its own kind. */
    kind: z.optional(z.enum(WORLD_KINDS)),
    /** The genre it belongs to, a slug of genres.json, the crumb's step before its kind. */
    genre: z.optional(Key),
    /** Up to 3 calls the team pins, shown in the world's chat bar and on its page (D271). */
    actions: z.optional(z.array(PinnedAction).check(z.minLength(1), z.maxLength(3))),
  })
  .check(
    z.check((ctx) => {
      const realms = new Set(ctx.value.realms);
      const labels = new Set<string>();
      ctx.value.actions?.forEach((action, index) => {
        const issue = (field: "realm" | "label", message: string) =>
          ctx.issues.push({ code: "custom", input: action[field], path: ["actions", index, field], message });
        if (!realms.has(action.realm)) issue("realm", "an action's realm is one of the world's realms");
        const key = labelKey(action.label);
        if (labels.has(key)) issue("label", `a label reads as another: ${JSON.stringify(action.label)}`);
        labels.add(key);
      });
    }),
  );

export const Hubs = inUniverse(World);
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
    /** What it is, in a word, as the ticker and a world's label say it ("AMA", frames 4 and 6); unsaid, an event (Alexis, 8p). */
    kind: z.optional(z.string().check(z.regex(/^[A-Za-z][A-Za-z ]{0,11}$/))),
  }),
);
export { BubbleRules } from "./bubbleRules.ts";

const degrees = (limit: number) => z.number().check(z.gte(-limit), z.lte(limit));

/** What turns round the Earth (7v; Alexis, 2026-11-03): a project the team adds by hand, even with no realm, by its name and its own
 * address, the hub whose page it links to where it has one, and its station's size, 0 a small satellite (none) to 1 an artificial world,
 * a sign the team sets (Alexis, 2026-11-04); a name once. */
export const EarthOrbit = unique(
  list(
    z.strictObject({
      name: text(DATA_CAPS.name),
      url: Link,
      slug: z.optional(Key),
      size: z.optional(z.number().check(z.gte(0), z.lte(1))),
    }),
  ),
  "name",
  (r: { name: string }) => r.name,
);

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
