// A realm's or a world's two-sentence explanation, made by Jarvis from the realm's outline alone and kept in the server's table of its own:
// what the model answers, what jarvis gives the server, what the server gives a page, and a seed file's rows. Every text is capped here; the
// server's own check (server/src/explain/check.ts) still decides ready or refused before anything is kept.
import { RealmPath } from "./realmPath.ts";
import { REALM_TAGS } from "./worlds.ts";
import { z } from "./zod.ts";

export { REALM_TAGS } from "./worlds.ts";
export type RealmTag = (typeof REALM_TAGS)[number];

/** The most an explanation holds: characters, tags and sentences; the outline jarvis reads, in bytes; the model's output tokens. */
export const EXPLAIN_CAPS = { chars: 240, tags: 3, sentences: 2, outlineBytes: 12 * 1024, outputTokens: 120 } as const;

/** The explain prompt's version (jarvis/src/explainPrompt.ts pins it): bumped with the prompt, so an old row is never served as the new one's. */
export const REALM_EXPLAIN_VERSION = 1;

/** The model's answer alone, before anything is trusted: `sure` says the outline shows its kind and use beyond doubt; its `text` and `tags`
 * are read only when it is true, and a tag outside REALM_TAGS is dropped by `tagsOf`, never kept. */
export const RealmExplanation = z.strictObject({
  sure: z.boolean(),
  text: z.string().check(z.maxLength(2000)),
  tags: z.array(z.string().check(z.maxLength(64))).check(z.maxLength(32)),
});
export type RealmExplanation = z.infer<typeof RealmExplanation>;

/** The tags of a model's answer that the closed list holds, once each, EXPLAIN_CAPS.tags at most. */
export function tagsOf(tags: readonly string[]): RealmTag[] {
  const known = new Set<string>(REALM_TAGS);
  return [...new Set(tags)].filter((tag): tag is RealmTag => known.has(tag)).slice(0, EXPLAIN_CAPS.tags);
}

const ChainId = z.string().check(z.regex(/^[a-z0-9][a-z0-9_-]{0,63}$/));
const Tags = z.array(z.enum(REALM_TAGS)).check(z.maxLength(EXPLAIN_CAPS.tags));

/** What the server asks jarvis: one realm on one chain, whose outline jarvis reads itself. */
export const JarvisExplainRequest = z.strictObject({ chain: ChainId, realm: RealmPath });
export type JarvisExplainRequest = z.infer<typeof JarvisExplainRequest>;

const Cost = z.int().check(z.gte(0));

/** What jarvis answers the server: the model's answer, its tags already within the list, the model and the prompt's version, with the cost
 * the server adds to nothing but its log; or failed (it spent and gave nothing), spent (the day's budget gone), off. */
export const JarvisExplained = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("explained"),
    sure: z.boolean(),
    text: z.string().check(z.maxLength(2000)),
    tags: Tags,
    model: z.string().check(z.minLength(1), z.maxLength(64)),
    version: z.int(),
    cost: Cost,
  }),
  z.strictObject({ status: z.literal("failed"), cost: Cost }),
  z.strictObject({ status: z.literal("spent") }),
  z.strictObject({ status: z.literal("off") }),
]);
export type JarvisExplained = z.infer<typeof JarvisExplained>;

/** The kinds of subject an explanation is made for. A world's subject is its main realm's path until a composed line is decided. */
export const EXPLAIN_KINDS = ["realm", "world"] as const;
export const ExplainKind = z.enum(EXPLAIN_KINDS);
export type ExplainKind = z.infer<typeof ExplainKind>;

/** What a page reads: the line and its tags once made, `making` while one is, `none` when there is nothing to show. */
export const Explanation = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ready"),
    text: z.string().check(z.minLength(1), z.maxLength(EXPLAIN_CAPS.chars * 4)),
    tags: Tags,
  }),
  z.strictObject({ status: z.literal("making") }),
  z.strictObject({ status: z.literal("none") }),
]);
export type Explanation = z.infer<typeof Explanation>;

/** One row of a seed file the server loads at its start: a realm explained by the session's own agents, in the shape of Jarvis's answer. Its
 * text still passes the server's check; a row is kept with the model `seed` and never over a ready row of Jarvis's. */
export const ExplainSeedRow = z.strictObject({
  chain: ChainId,
  realm: RealmPath,
  sure: z.boolean(),
  text: z.string().check(z.maxLength(2000)),
  tags: z.array(z.string().check(z.maxLength(64))).check(z.maxLength(32)),
});
export const ExplainSeed = z.strictObject({
  version: z.literal(REALM_EXPLAIN_VERSION),
  rows: z.array(ExplainSeedRow).check(z.maxLength(20_000)),
});
export type ExplainSeed = z.infer<typeof ExplainSeed>;
