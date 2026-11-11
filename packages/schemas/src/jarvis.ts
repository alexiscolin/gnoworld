// What Jarvis hands the client (ADR-0002 §4 and §5; docs/plans/slice-10.md, 10d): a realm's digest, a proposed action and an
// answer button, data and never HTML, each string bounded in code points (as Zod counts). A proposal names no coins: a field
// for them fails here, and the person types any amount in the call card. A realm's path and a link are only bounded: they
// are good when they are the realm and the links the server read (server/src/jarvis/ground.ts and proposed.ts). Since 10g,
// the door's bodies too: a question, what the door sends jarvis, the answer, an admin's change and the values it changes;
// since 10k, a line's translation and a realm's digest.
import { Address } from "./address.ts";
import { CALL_CAPS, CallArgs, funcName, Key, RealmPath } from "./data.ts";
import { ChallengeRequest } from "./login.ts";
import { PinId } from "./pins.ts";
import { RoomId } from "./rooms.ts";
import { z } from "./zod.ts";

/** The most a digest, a proposal and a button may hold: blocks, list entries, and each kind of string in code points. */
export const JARVIS_CAPS = {
  blocks: 50,
  facts: 12,
  points: 100,
  links: 10,
  args: CALL_CAPS.args,
  label: CALL_CAPS.label,
  value: 200,
  href: 2048,
  announcement: 280,
  text: 1000,
  arg: CALL_CAPS.arg,
  why: 200,
  name: CALL_CAPS.name,
  realm: 128,
  place: 200,
} as const;

const text = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));
const list = <T extends z.ZodMiniType>(item: T, max: number) => z.array(item).check(z.minLength(1), z.maxLength(max));

/** One call to prefill: a realm's function, its arguments by name as text (a call carries them as text), and why. */
export const ProposedAction = z.strictObject({
  realm: text(JARVIS_CAPS.realm),
  function: text(JARVIS_CAPS.name),
  args: CallArgs,
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

/** The room's lines a question carries to jarvis at most, and the bytes of their text (Alexis, 10g-1). */
export const JARVIS_LINES = { lines: 30, bytes: 8192 } as const;

// A person's own question, which the server holds to its own cap; and the fixed asks (D13985), whose words are Jarvis's own,
// so a page sets none of them and one answer serves everyone who asks the same at the same place.
const Own = { question: text(DOOR_CAPS.question), room: RoomId };
const Here = { ask: z.literal("here"), room: RoomId };
const CatchUp = { ask: z.literal("catch-up"), room: RoomId };
const Explain = { ask: z.literal("function"), room: RoomId, realm: RealmPath, function: funcName(JARVIS_CAPS.name) };

/** What a person asks Jarvis from a room: a question of their own, or a fixed ask: what can be done here, the room caught up,
 * a realm's function explained. The server adds the room's lines (D42). */
export const JarvisQuestion = z.union([
  z.strictObject(Own),
  z.strictObject(Here),
  z.strictObject(CatchUp),
  z.strictObject(Explain),
]);
export type JarvisQuestion = z.infer<typeof JarvisQuestion>;

const Answered = {
  status: z.literal("answered"),
  markdown: text(DOOR_CAPS.answer),
  buttons: z.array(AnswerButton).check(z.maxLength(DOOR_CAPS.buttons)),
};
const spentOrOffAnswer = [
  z.strictObject({ status: z.literal("spent") }),
  z.strictObject({ status: z.literal("off") }),
] as const;

/** Jarvis's answer as the client reads it: a text and its buttons; or, each answered by a fixed line or the page's form (D13985):
 * `declined` (off its ground), `paused` (3 strikes today), `capped` (the person's share spent), `early` (an account too new or never
 * heard), `busy` (the room's hour all asked), `spent` (the day's budget gone), `off` (switched off, by default). */
export const JarvisAnswer = z.discriminatedUnion("status", [
  z.strictObject(Answered),
  z.strictObject({ status: z.literal("declined") }),
  z.strictObject({ status: z.literal("paused") }),
  z.strictObject({ status: z.literal("capped") }),
  z.strictObject({ status: z.literal("early") }),
  z.strictObject({ status: z.literal("busy") }),
  ...spentOrOffAnswer,
]);
export type JarvisAnswer = z.infer<typeof JarvisAnswer>;

/** What an answer cost, in millionths of a dollar. */
const Cost = z.int().check(z.gte(0));

/** An answer as jarvis gives the door, with its cost, which the door adds to the person's share and the page never reads (D13985):
 * answered, declined, failed (it spent and gave nothing: its turns or tokens used, the model refusing or failing), spent (with what
 * its turns had cost when the day's budget ran out mid-way), or off. */
export const JarvisPaidAnswer = z.discriminatedUnion("status", [
  z.strictObject({ ...Answered, cost: Cost }),
  z.strictObject({ status: z.literal("declined"), cost: Cost }),
  z.strictObject({ status: z.literal("failed"), cost: Cost }),
  z.strictObject({ status: z.literal("spent"), cost: z.optional(Cost) }),
  z.strictObject({ status: z.literal("off") }),
]);
export type JarvisPaidAnswer = z.infer<typeof JarvisPaidAnswer>;

/** Where jarvis takes a question, and where its budgets are read and changed, on the network only it and the server
 * share (D42). */
/** The header the door proves itself to jarvis with: a shared secret, read from a file on both sides (10u-g2). */
export const JARVIS_KEY_HEADER = "x-jarvis-key";
export const JARVIS_PATHS = { ask: "/ask", budgets: "/budgets", translate: "/translate", digest: "/digest" } as const;

/** A question as jarvis takes it from the door: the question, its room, and the room's last lines, oldest first, each
 * by a number for who said it in this question alone, the asker 0, never an account (D91). */
const lines = z
  .array(
    z.strictObject({
      speaker: z.int().check(z.gte(0), z.lte(JARVIS_LINES.lines)),
      text: text(JARVIS_LINES.bytes),
      time: z.optional(z.iso.datetime()),
    }),
  )
  .check(z.maxLength(JARVIS_LINES.lines));
export const JarvisAsk = z.union([
  z.strictObject({ ...Own, lines }),
  z.strictObject({ ...Here, lines }),
  z.strictObject({ ...CatchUp, lines }),
  z.strictObject({ ...Explain, lines }),
]);
export type JarvisAsk = z.infer<typeof JarvisAsk>;

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

/** The languages a line is translated into, by their ISO 639-1 code (D190): a bounded list, so a line has a bounded
 * number of translations. */
export const JARVIS_LANGUAGES = [
  "en",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "uk",
  "tr",
  "ar",
  "hi",
  "ja",
  "ko",
  "zh",
] as const;
const Language = z.enum(JARVIS_LANGUAGES);

/** The most a translation holds, in code points: twice a line's bound, as a translation runs longer than its original. */
export const TRANSLATION_CAPS = { text: 16_000 } as const;

/** A room's line to translate, as a page asks the door: the line by its id, never its text, which is the server's. */
export const JarvisTranslateRequest = z.strictObject({ room: RoomId, msgid: PinId, language: Language });
export type JarvisTranslateRequest = z.infer<typeof JarvisTranslateRequest>;

/** A line's text and the language to translate it into, as the door sends jarvis. */
export const JarvisTranslate = z.strictObject({ text: text(JARVIS_LINES.bytes), language: Language });
export type JarvisTranslate = z.infer<typeof JarvisTranslate>;

/** A line's translation, or its original kept (a translation dropped, ADR-0002 §5 point 5), spent, or off. */
export const JarvisTranslation = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("translated"), text: text(TRANSLATION_CAPS.text) }),
  z.strictObject({ status: z.literal("original") }),
  z.strictObject({ status: z.literal("spent") }),
  z.strictObject({ status: z.literal("off") }),
]);
export type JarvisTranslation = z.infer<typeof JarvisTranslation>;

/** A realm's digest asked for, by the universe whose chain holds it and its path, the same from a page and the door. */
export const JarvisDigestRequest = z.strictObject({ universe: Key, realm: RealmPath });
export type JarvisDigestRequest = z.infer<typeof JarvisDigestRequest>;

// A digest's fields on both wires: the digest, its one proposal or none, and the height its reads were made at.
const digested = {
  status: z.literal("digest"),
  digest: Digest,
  proposal: z.nullable(ProposedAction),
  height: z.int().check(z.gte(1)),
};
const spentOrOff = [
  z.strictObject({ status: z.literal("spent") }),
  z.strictObject({ status: z.literal("off") }),
] as const;

/** A realm's digest as a page reads it, with the block height its page and functions were read at and the one action
 * it proposes, if any; none when no digest its reads hold could be made, then the whole page shows (ADR-0002 §4);
 * spent; or off. */
export const JarvisDigest = z.discriminatedUnion("status", [
  z.strictObject(digested),
  z.strictObject({ status: z.literal("none") }),
  ...spentOrOff,
]);
export type JarvisDigest = z.infer<typeof JarvisDigest>;

/** A digest as jarvis answers the door: `made` says the model made it, or its none, for this request, so the door
 * keeps the asker's question; the door hands the page JarvisDigest, without it (10k-1, the second round's T3). */
export const JarvisMadeDigest = z.discriminatedUnion("status", [
  z.strictObject({ ...digested, made: z.boolean() }),
  z.strictObject({ status: z.literal("none"), made: z.boolean() }),
  ...spentOrOff,
]);
export type JarvisMadeDigest = z.infer<typeof JarvisMadeDigest>;
