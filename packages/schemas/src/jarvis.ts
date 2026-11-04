// What Jarvis hands the client (ADR-0002 §4 and §5; docs/plans/slice-10.md, 10d): a realm's digest, a proposed action and an
// answer button, data and never HTML, each string bounded in code points (as Zod counts). A proposal names no coins: a field
// for them fails here, and the person types any amount in the call card. A realm's path and a link are only bounded: they
// are good when they are the realm and the links the server read (server/src/jarvis/ground.ts and proposed.ts).
import { z } from "./zod.ts";

/** The most a digest, a proposal and a button may hold: blocks, list entries, and each kind of string in code points. */
export const JARVIS_CAPS = {
  blocks: 50,
  facts: 12,
  points: 100,
  links: 10,
  args: 16,
  label: 80,
  value: 200,
  href: 2048,
  announcement: 280,
  text: 1000,
  arg: 1000,
  why: 200,
  name: 128,
  realm: 128,
  place: 200,
} as const;

const text = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));
const list = <T extends z.ZodMiniType>(item: T, max: number) => z.array(item).check(z.minLength(1), z.maxLength(max));

/** One call to prefill: a realm's function, its arguments by name as text (a call carries them as text), and why. */
export const ProposedAction = z.strictObject({
  realm: text(JARVIS_CAPS.realm),
  function: text(JARVIS_CAPS.name),
  args: z
    .record(text(JARVIS_CAPS.name), z.string().check(z.maxLength(JARVIS_CAPS.arg)))
    .check(z.refine((args) => Object.keys(args).length <= JARVIS_CAPS.args, "too many arguments")),
  why: text(JARVIS_CAPS.why),
});
export type ProposedAction = z.infer<typeof ProposedAction>;

const Fact = z.strictObject({ label: text(JARVIS_CAPS.label), value: text(JARVIS_CAPS.value) });
const Link = z.strictObject({
  label: text(JARVIS_CAPS.label),
  href: z.string().check(z.maxLength(JARVIS_CAPS.href), z.startsWith("https://")),
});

// A chart's point as JavaScript writes it in full: one in an exponent's form (`1e+21`) reads as two other numbers.
const Point = z.number().check(z.refine((point) => !String(point).includes("e"), "a point written in full"));

/** A digest's block, from ADR-0002 §4's table. */
export const DigestBlock = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("facts"), facts: list(Fact, JARVIS_CAPS.facts) }),
  z.strictObject({ type: z.literal("chart"), label: text(JARVIS_CAPS.label), points: list(Point, JARVIS_CAPS.points) }),
  z.strictObject({ type: z.literal("links"), links: list(Link, JARVIS_CAPS.links) }),
  z.strictObject({ type: z.literal("form"), action: ProposedAction }),
  z.strictObject({ type: z.literal("announcement"), text: text(JARVIS_CAPS.announcement) }),
  z.strictObject({ type: z.literal("text"), markdown: text(JARVIS_CAPS.text) }),
]);
export type DigestBlock = z.infer<typeof DigestBlock>;

/** A realm as a few blocks, its page one link away on gnoweb. */
export const Digest = z.strictObject({ blocks: list(DigestBlock, JARVIS_CAPS.blocks) });
export type Digest = z.infer<typeof Digest>;

/** A place's path, as the app's places have them (`/`, `/w/bubble`, `/net/onyx/`): lower-case words, never `//`. */
const Place = z.string().check(z.minLength(1), z.maxLength(JARVIS_CAPS.place), z.regex(/^(?:\/[a-z0-9-]+)*\/?$/));

/** A button on an answer: fly to a place, or open a proposed action's call card. */
export const AnswerButton = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("fly"), label: text(JARVIS_CAPS.label), place: Place }),
  z.strictObject({ type: z.literal("action"), label: text(JARVIS_CAPS.label), action: ProposedAction }),
]);
export type AnswerButton = z.infer<typeof AnswerButton>;
