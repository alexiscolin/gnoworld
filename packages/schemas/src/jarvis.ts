// What Jarvis hands the client (ADR-0002 §4 and §5; docs/plans/slice-10.md, 10d): a realm's digest, a proposed action and an
// answer button, data and never HTML, each string bounded in code points (as Zod counts). A proposal names no coins: a field
// for them fails here, and the person types any amount in the call card. A realm's path and a link are only bounded: they
// are good when they are the realm and the links the server read (server/src/jarvis/ground.ts and proposed.ts). Since 10g,
// the door's bodies too: a question, the answer as the client reads it, and an admin's change and the values it changes.
import { Address } from "./address.ts";
import { ChallengeRequest } from "./login.ts";
import { RoomId } from "./rooms.ts";
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

/** The most the door takes and gives (D90): a question's and an answer's code points, an answer's buttons, a quota in
 * questions, a budget in whole dollars, and the accounts with no quota. */
export const DOOR_CAPS = {
  question: 8000,
  answer: 8000,
  buttons: 5,
  quota: 1000,
  dollars: 500,
  unlimited: 1000,
} as const;

/** A question asked from a room: the server holds it to its own cap and adds the room's lines (D42). */
export const JarvisQuestion = z.strictObject({ question: text(DOOR_CAPS.question), room: RoomId });
export type JarvisQuestion = z.infer<typeof JarvisQuestion>;

/** Jarvis's answer as the client reads it: a text and its buttons, or `spent`, the day's budget gone, when the client
 * shows its form without a model (plan §1). */
export const JarvisAnswer = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("answered"),
    markdown: text(DOOR_CAPS.answer),
    buttons: z.array(AnswerButton).check(z.maxLength(DOOR_CAPS.buttons)),
  }),
  z.strictObject({ status: z.literal("spent") }),
]);
export type JarvisAnswer = z.infer<typeof JarvisAnswer>;

const count = (max: number) => z.int().check(z.gte(1), z.lte(max));

/** One of jarvis's two budgets a day, in whole dollars, as its settings take them (D65). */
export const JarvisBudget = z.strictObject({ budget: z.enum(["ask", "translate"]), dollars: count(DOOR_CAPS.dollars) });
export type JarvisBudget = z.infer<typeof JarvisBudget>;

/** Both of jarvis's budgets a day, in whole dollars. */
export const JarvisBudgets = z.strictObject({ ask: count(DOOR_CAPS.dollars), translate: count(DOOR_CAPS.dollars) });
export type JarvisBudgets = z.infer<typeof JarvisBudgets>;

/** One change an admin signs afresh (ADR-0002 §6): a quota, an account's quota taken off or given back, a budget. */
export const JarvisChange = z.discriminatedUnion("setting", [
  z.strictObject({ setting: z.literal("quota"), questions: count(DOOR_CAPS.quota) }),
  z.strictObject({ setting: z.literal("quota_unnamed"), questions: count(DOOR_CAPS.quota) }),
  z.strictObject({ setting: z.literal("unlimited"), account: Address, unlimited: z.boolean() }),
  z.extend(JarvisBudget, { setting: z.literal("budget") }),
]);
export type JarvisChange = z.infer<typeof JarvisChange>;

/** A change asked for on a chain, whose challenge the admin's wallet signs as a login's. */
export const JarvisChangeRequest = z.extend(ChallengeRequest, { change: JarvisChange });

/** What the admin API answers: the quotas, the accounts with no quota, and jarvis's budgets, or none when it did not
 * answer. */
export const JarvisSettings = z.strictObject({
  quota: count(DOOR_CAPS.quota),
  quotaUnnamed: count(DOOR_CAPS.quota),
  unlimited: z.array(Address).check(z.maxLength(DOOR_CAPS.unlimited)),
  budgets: z.nullable(JarvisBudgets),
});
export type JarvisSettings = z.infer<typeof JarvisSettings>;
