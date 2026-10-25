// The roles file (decisions 147 and 149): the team, the trusted, and each world's moderators and
// anti-spam rules; since 3m, each world's groups of accounts and the type of its rooms; since 4b, the
// sections its rooms are listed in. Who may do what is answered from it alone. Read whole in review: a
// wrong line here hands out power.
import { readFileSync } from "node:fs";
import { Address, RoomName } from "@gnoworld/schemas";
import { z } from "zod";

// Built at each read, not at import: StrykerJS can only mutate what runs inside a test.
function rules() {
  const Count = z.number().int().min(0);
  return z.strictObject({
    bannedWords: z.array(z.string().min(1)),
    linksPerMessage: Count,
    mentionsPerMessage: Count,
    linksForNewAccount: Count,
  });
}

// A world's slug and a group's name: lower-case letters and digits, single hyphens between.
function slug() {
  return z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
}

// A room's type (3m): who joins it, who reads it and who speaks in it (rooms/types.ts). Only a members
// room names its readers, and a members-write room its writers too; hidden leaves it out of the lists.
function room() {
  const Group = slug();
  const none = z.never().optional();
  const base = { room: z.string(), hidden: z.boolean().default(false) };
  return z.discriminatedUnion("type", [
    z.strictObject({ ...base, type: z.enum(["open", "announcement", "accounts"]), readers: none, writers: none }),
    z.strictObject({ ...base, type: z.literal("members"), readers: Group, writers: none }),
    z.strictObject({ ...base, type: z.literal("members-write"), readers: Group, writers: Group }),
  ]);
}

// A room of the world: its main room, or #<slug>/<a room's name>, within Ergo's channellen of 64.
function ownRoom(slug: string, name: string): boolean {
  return (
    name === `#${slug}` ||
    (name.startsWith(`#${slug}/`) && RoomName.safeParse(name.slice(slug.length + 2)).success && name.length <= 64)
  );
}

// A section of a world's rooms (4b): a name for the lists, and its room ids, in the order to show them.
function section() {
  return z.strictObject({ name: z.string().min(1).max(64), rooms: z.array(z.string()).max(500) });
}

// A section's name once in the world and each room of it in one section, once: either twice would show
// twice in the lists. A section may name a room the file does not type, one a moderator made.
function checkSections(slug: string, sections: readonly Section[], ctx: z.RefinementCtx): void {
  const names = new Set<string>();
  const placed = new Set<string>();
  for (const [at, { name, rooms }] of sections.entries()) {
    if (names.has(name)) ctx.addIssue({ code: "custom", path: ["sections", at, "name"] });
    names.add(name);
    for (const [index, id] of rooms.entries()) {
      if (!ownRoom(slug, id) || placed.has(id))
        ctx.addIssue({ code: "custom", path: ["sections", at, "rooms", index] });
      placed.add(id);
    }
  }
}

function world(Addresses: z.ZodType<Address[]>) {
  // A __proto__ key would vanish in the record (zod 4.6.5, $ZodRecord skips it): refused by name instead.
  const Groups = z
    .unknown()
    .refine((value) => typeof value !== "object" || value === null || !Object.hasOwn(value, "__proto__"))
    .pipe(z.record(slug(), Addresses));
  return z
    .strictObject({
      // Its main room, #<slug>, within Ergo's channellen of 64 (deploy/ergo/ircd.yaml.tmpl).
      slug: slug().max(63),
      moderators: Addresses,
      rules: rules(),
      groups: Groups.default({}),
      rooms: z.array(room()).default([]),
      sections: z.array(section()).max(50).default([]),
    })
    .superRefine(({ slug, groups, rooms, sections }, ctx) => {
      checkSections(slug, sections, ctx);
      const seen = new Set<string>();
      for (const [at, { room: name, readers, writers }] of rooms.entries()) {
        if (!ownRoom(slug, name) || seen.has(name))
          ctx.addIssue({ code: "custom", path: ["rooms", at, "room"], message: "room" });
        seen.add(name);
        for (const [key, group] of Object.entries({ readers, writers }))
          if (group !== undefined && !Object.hasOwn(groups, group))
            ctx.addIssue({ code: "custom", path: ["rooms", at, key], message: "group" });
      }
    });
}

function schema() {
  const unique = (list: readonly string[]): boolean => new Set(list).size === list.length;
  const Addresses = z.array(Address).refine(unique);
  return z
    .strictObject({
      team: Addresses,
      trusted: Addresses,
      worlds: z.array(world(Addresses)).refine((worlds) => unique(worlds.map(({ slug }) => slug))),
    })
    .superRefine(({ team, trusted, worlds }, ctx) => {
      // The team is trusted and moderates every world by itself: listing it again is a mistake.
      const again = (list: readonly Address[], path: (string | number)[]): void => {
        for (const [at, who] of list.entries())
          if (team.includes(who)) ctx.addIssue({ code: "custom", path: [...path, at], message: "team" });
      };
      again(trusted, ["trusted"]);
      for (const [at, world] of worlds.entries()) {
        again(world.moderators, ["worlds", at, "moderators"]);
        // Ergo's invite list holds 100 entries (chan-list-modes): a members room's readers, its writers,
        // the world's moderators and the team, each account once.
        for (const [index, { readers, writers }] of world.rooms.entries()) {
          if (readers === undefined) continue;
          const groups = [readers, writers ?? readers].flatMap((name) => world.groups[name] ?? []);
          if (new Set([...groups, ...world.moderators, ...team]).size > 100)
            ctx.addIssue({ code: "custom", path: ["worlds", at, "rooms", index, "readers"], message: "full" });
        }
      }
    });
}

export type Rules = z.infer<ReturnType<typeof rules>>;

export type Room =
  | { type: "open" | "announcement" | "accounts"; hidden: boolean }
  | { type: "members"; readers: string; hidden: boolean }
  | { type: "members-write"; readers: string; writers: string; hidden: boolean };

// A named list of a world's rooms, in the order a reader sees them (4b).
interface Section {
  name: string;
  rooms: readonly string[];
}

export interface Roles {
  team: ReadonlySet<Address>;
  trusted: ReadonlySet<Address>;
  worlds: ReadonlyMap<
    string,
    {
      moderators: ReadonlySet<Address>;
      rules: Rules;
      // All filled by loadRoles; a world without them has none.
      groups?: ReadonlyMap<string, ReadonlySet<Address>>;
      rooms?: ReadonlyMap<string, Room>;
      sections?: readonly Section[];
    }
  >;
}

// ponytail: read at start, so a change waits for a restart; slice 12's console will watch the file.
export function loadRoles(path: string): Roles {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(`roles file ${path}: unreadable`, { cause });
  }
  // The place and the kind only: JSON.parse and Zod may quote what the file holds.
  const parsed = schema().safeParse(json(text));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const place = issue === undefined || issue.path.length === 0 ? "(top)" : issue.path.join(".");
    throw new Error(`roles file ${path}: ${place}: ${issue?.code ?? "invalid"}`);
  }
  const { team, trusted, worlds } = parsed.data;
  return {
    team: new Set(team),
    trusted: new Set(trusted),
    worlds: new Map(
      worlds.map(({ slug, moderators, rules, groups, rooms, sections }) => [
        slug,
        {
          moderators: new Set(moderators),
          rules,
          groups: new Map(Object.entries(groups).map(([name, members]) => [name, new Set(members)])),
          rooms: new Map(rooms.map(({ room: name, ...type }) => [name, type])),
          sections,
        },
      ]),
    ),
  };
}

// What is not JSON reaches the schema as a value it refuses, so the error names no content.
function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return Symbol("not JSON");
  }
}

export const isTeam = (roles: Roles, who: Address): boolean => roles.team.has(who);

export const isTrusted = (roles: Roles, who: Address): boolean => isTeam(roles, who) || roles.trusted.has(who);

/** Who the automatic mute spares (decision 146): the team and the trusted, by the account Ergo names; a
 * world's moderator by that role alone is not (decision 149). Their lines are still checked and hidden. */
export const spared =
  (roles: Roles) =>
  (account: string): boolean => {
    const who = Address.safeParse(account);
    return who.success && isTrusted(roles, who.data);
  };

// A world the file does not name has no moderator, the team's included: the server knows no rooms of it.
export function moderates(roles: Roles, who: Address, slug: string): boolean {
  const world = roles.worlds.get(slug);
  return world !== undefined && (isTeam(roles, who) || world.moderators.has(who));
}

/** Who may make and archive a world's rooms (3l): its moderators and the team, as `moderates`; rights
 * earned by activity are a later slice's (decision 162). */
export const mayCreateRoom = (roles: Roles, who: Address, slug: string): boolean => moderates(roles, who, slug);
