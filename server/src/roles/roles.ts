// The roles file (decisions 147 and 149): the team, the trusted, and each world's moderators and
// anti-spam rules. Who may do what is answered from it alone. Read whole in review: a wrong line here
// hands out power.
import { readFileSync } from "node:fs";
import { Address } from "@gnoworld/schemas";
import { z } from "zod";

const unique = (list: readonly string[]): boolean => new Set(list).size === list.length;
const Addresses = z.array(Address).refine(unique);
const Count = z.number().int().min(0);
const Rules = z.strictObject({
  bannedWords: z.array(z.string().min(1)),
  linksPerMessage: Count,
  mentionsPerMessage: Count,
  linksForNewAccount: Count,
});
const World = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  moderators: Addresses,
  rules: Rules,
});
const File = z
  .strictObject({
    team: Addresses,
    trusted: Addresses,
    worlds: z.array(World).refine((worlds) => unique(worlds.map(({ slug }) => slug))),
  })
  .superRefine(({ team, trusted, worlds }, ctx) => {
    // The team is trusted and moderates every world by itself: listing it again is a mistake.
    const again = (list: readonly Address[], path: (string | number)[]): void => {
      for (const [at, who] of list.entries())
        if (team.includes(who)) ctx.addIssue({ code: "custom", path: [...path, at], message: "team" });
    };
    again(trusted, ["trusted"]);
    for (const [at, world] of worlds.entries()) again(world.moderators, ["worlds", at, "moderators"]);
  });

export interface Roles {
  team: ReadonlySet<Address>;
  trusted: ReadonlySet<Address>;
  worlds: ReadonlyMap<string, { moderators: ReadonlySet<Address>; rules: z.infer<typeof Rules> }>;
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
  const parsed = File.safeParse(json(text));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const place = issue === undefined || issue.path.length === 0 ? "(top)" : issue.path.join(".");
    throw new Error(`roles file ${path}: ${place}: ${issue?.code ?? "invalid"}`);
  }
  const { team, trusted, worlds } = parsed.data;
  return {
    team: new Set(team),
    trusted: new Set(trusted),
    worlds: new Map(worlds.map(({ slug, moderators, rules }) => [slug, { moderators: new Set(moderators), rules }])),
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

// A world the file does not name has no moderator, the team's included: the server knows no rooms of it.
export function moderates(roles: Roles, who: Address, slug: string): boolean {
  const world = roles.worlds.get(slug);
  return world !== undefined && (isTeam(roles, who) || world.moderators.has(who));
}
