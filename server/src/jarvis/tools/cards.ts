// Jarvis's cards (ADR-0002 §4, §5 point 4; D102): the model hands a realm's digest, a proposed action or an answer's
// button through these tools, and the server keeps it only once 10d's checks pass on what it read itself, that call:
// the realm's height and page through gnomcp, its `vm/qfuncs` on its universe's node, and the asker's words for a
// proposal's or a button's arguments alone (D107). A refused card goes back to the model naming what is missing.
import { placeAt } from "@gnoworld/core";
import { AnswerButton, Digest, ProposedAction } from "@gnoworld/schemas";
import type { FunctionList } from "@gnoworld/schemas/functions";
import { z } from "zod";
import type { Ran } from "../gnomcp.ts";
import { grounded, groundedButton, sourcesOf, type Read } from "../ground.ts";
import { CARDS, type Asked, type ReadAt } from "./kept.ts";
import type { Places, Universe } from "./places.ts";

/** A realm's `vm/qfuncs` read on a node, by its rpc; the shared chain read's shape (Alexis, 10f's question 2). */
export type ReadFunctions = (
  rpc: string,
  realm: string,
) => Promise<{ readonly ok: true; readonly value: FunctionList } | { readonly ok: false }>;

interface Setup {
  readonly chains: readonly string[];
  readonly places: Places;
  /** gnomcp's call, for `gno_status` and `gno_render`. */
  readonly read: (name: string, args: unknown) => Promise<Ran>;
  readonly functions: ReadFunctions;
}

// A page is read only as far as 64 KiB, cut on its last line's end so no number is read cut (D102).
const PAGE_BYTES = 64 * 1024;
const refused = (why: string): Ran => ({ ok: true, isError: true, text: `Refused, nothing kept: ${why}` });
const kept = (what: string): Ran => ({ ok: true, isError: false, text: `Kept: ${what}` });

function definitionsOf([first, ...rest]: readonly string[]) {
  if (first === undefined) throw new Error("cards: no chain profile");
  const profile = z.enum([first, ...rest]).describe("The realm's chain: one of Jarvis's chain profiles.");
  const realm = z.string().min(1).max(128).describe("The realm's path, such as `gno.land/r/gov/dao`.");
  const read =
    " The server reads the realm itself and keeps it only when its page and functions hold every number, link, account and function stated; else it says what is missing.";
  return [
    {
      name: "give_digest" as const,
      description: `A realm's digest to show with the answer: a few blocks of what its page states, never more.${read}`,
      args: z.strictObject({ profile, realm, digest: Digest }),
    },
    {
      name: "propose_action" as const,
      description: `One call of a realm's write function the person may sign, prefilled, never with coins.${read}`,
      args: z.strictObject({ profile, action: ProposedAction }),
    },
    {
      name: "give_button" as const,
      description: `A button on the answer: fly to a place find_place gave, or open a proposal's call card (then name its chain).${read}`,
      args: z.strictObject({ profile: profile.optional(), button: AnswerButton }),
    },
  ] as const;
}

// The height its node's status gives, when its node and gnomcp's profile are both its universe's chain.
function heightOf(status: Ran, universe: Universe): number | undefined {
  if (!status.ok || status.isError) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(status.text);
  } catch {
    return undefined;
  }
  const Status = z.object({ height: z.int().positive(), chain_id: z.string(), node_chain_id: z.string() });
  const parsed = Status.safeParse(json);
  if (!parsed.success) return undefined;
  const { height, chain_id: declared, node_chain_id: node } = parsed.data;
  return declared === universe.chainId && node === universe.chainId ? height : undefined;
}

// The page inside gnomcp 0.11.0's wrapping (read live, 2026-11-04), cut to its last whole line within 64 KiB.
function pageOf(text: string, realm: string): string {
  const [open, close] = [`<untrusted_content kind="render" source="${realm}">\n`, "\n</untrusted_content>"];
  const page = text.startsWith(open) && text.endsWith(close) ? text.slice(open.length, -close.length) : text;
  // encodeInto reads no more of the page than its 64 KiB hold, whatever the page's size.
  const { read } = new TextEncoder().encodeInto(page, new Uint8Array(PAGE_BYTES));
  if (read === page.length) return page;
  return page.slice(0, page.lastIndexOf("\n", read - 1) + 1);
}

type Sourced = { ok: true; at: ReadAt; read: Read } | { ok: false; why: string };

// A realm's reads, that call: its height, its page, and its functions when a form needs them.
async function readRealm(setup: Setup, at: { profile: string; realm: string; forms: boolean }): Promise<Sourced> {
  const universe = setup.places.universes.get(at.profile);
  if (universe === undefined) return { ok: false, why: "its chain is no universe's." };
  const height = heightOf(await setup.read("gno_status", { profile: at.profile }), universe);
  if (height === undefined) return { ok: false, why: "its chain's height could not be read." };
  const page = await setup.read("gno_render", { profile: at.profile, realm: at.realm });
  if (!page.ok || page.isError) return { ok: false, why: "the realm's page could not be read." };
  const listed = at.forms ? await setup.functions(universe.rpc, at.realm) : { ok: true as const, value: null };
  if (!listed.ok) return { ok: false, why: "the realm's functions could not be read." };
  const texts = [{ from: "node" as const, text: pageOf(page.text, at.realm), height }];
  const read = { realm: at.realm, origin: universe.gnoweb, functions: { list: listed.value, height }, texts };
  return { ok: true, at: { profile: at.profile, height }, read };
}

// The asker's words among a read's texts: a proposal's or a button's arguments may take them.
const withQuestion = (read: Read, asked: Asked): Read => ({
  ...read,
  texts: [...read.texts, { from: "question", text: asked.text }],
});

function whyOf(
  checked: { reason: "shape" | "nothing" } | { reason: "missing"; missing: { kind: string; value: string }[] },
) {
  // Its schema passed already, so a card is never refused for its shape: it states nothing checkable.
  if (checked.reason !== "missing")
    return "it states nothing a read can hold: give a number, a link, an account or a form of the realm's page.";
  const missing = checked.missing.map(({ kind, value }) => `${kind} ${value}`).join("; ");
  return `the chain's reads lack ${missing}. State only what they hold.`;
}

type Definitions = ReturnType<typeof definitionsOf>;
type Args<At extends 0 | 1 | 2> = z.output<Definitions[At]["args"]>;

async function digestCard(setup: Setup, args: Args<0>, asked: Asked): Promise<Ran> {
  if (asked.cards.full("digest")) return refused(`an answer holds ${String(CARDS.digests)} digests at most.`);
  const forms = args.digest.blocks.some((block) => block.type === "form");
  const sourced = await readRealm(setup, { profile: args.profile, realm: args.realm, forms });
  if (!sourced.ok) return refused(sourced.why);
  const checked = grounded(args.digest, sourcesOf(sourced.read));
  if (!checked.ok) return refused(whyOf(checked));
  const card = { kind: "digest", realm: args.realm, read: sourced.at, digest: checked.digest } as const;
  if (!asked.cards.keep(card)) return refused("its call's time is up, or the answer holds its digests.");
  return kept(`the digest of ${args.realm}, read at block ${String(sourced.at.height)}, shows with the answer.`);
}

async function proposalCard(setup: Setup, args: Args<1>, asked: Asked): Promise<Ran> {
  if (asked.cards.full("proposal")) return refused(`an answer holds ${String(CARDS.proposals)} proposal at most.`);
  const sourced = await readRealm(setup, { profile: args.profile, realm: args.action.realm, forms: true });
  if (!sourced.ok) return refused(sourced.why);
  const checked = grounded(
    { blocks: [{ type: "form", action: args.action }] },
    sourcesOf(withQuestion(sourced.read, asked)),
  );
  if (!checked.ok) return refused(whyOf(checked));
  if (!asked.cards.keep({ kind: "proposal", read: sourced.at, action: args.action }))
    return refused("its call's time is up, or the answer holds its proposal.");
  return kept(
    `the proposal of ${args.action.function}, read at block ${String(sourced.at.height)}, shows with the answer.`,
  );
}

// A button to fly reads no chain, so its label may state no chain fact; its place is one of the data's.
function flyCard(setup: Setup, button: Extract<AnswerButton, { type: "fly" }>, asked: Asked): Promise<Ran> {
  if (placeAt(setup.places.places, button.place) === undefined)
    return Promise.resolve(refused(`no place of gnoworld's data is at ${button.place}; find_place gives them.`));
  const checked = groundedButton(button, sourcesOf({ realm: "", origin: "", texts: [] }));
  if (!checked.ok) return Promise.resolve(refused(whyOf(checked)));
  if (!asked.cards.keep({ kind: "button", button })) return Promise.resolve(refused("its call's time is up."));
  return Promise.resolve(kept(`the button to ${button.place}.`));
}

async function buttonCard(setup: Setup, args: Args<2>, asked: Asked): Promise<Ran> {
  if (asked.cards.full("button")) return refused(`an answer holds ${String(CARDS.buttons)} buttons at most.`);
  const { button, profile } = args;
  if (button.type === "fly") return flyCard(setup, button, asked);
  if (profile === undefined) return refused("an action's button names its realm's chain profile.");
  const sourced = await readRealm(setup, { profile, realm: button.action.realm, forms: true });
  if (!sourced.ok) return refused(sourced.why);
  const checked = groundedButton(button, sourcesOf(withQuestion(sourced.read, asked)));
  if (!checked.ok) return refused(whyOf(checked));
  if (!asked.cards.keep({ kind: "button", button, read: sourced.at })) return refused("its call's time is up.");
  return kept(`the button to ${button.action.function}, read at block ${String(sourced.at.height)}.`);
}

/** The card tools for Jarvis's chains, each named after its universe; throws when one names no universe of the data. */
export function cardTools(setup: Setup) {
  const strange = setup.chains.find((chain) => !setup.places.universes.has(chain));
  if (strange !== undefined)
    throw new Error(`cards: the chain profile ${JSON.stringify(strange)} is no universe of the data`);
  const definitions = definitionsOf(setup.chains);
  const [digest, proposal, button] = definitions;
  return {
    definitions,
    /** A card's call, its arguments parsed again by its own schema; refused when they fail it or it is no card's. */
    run(call: { readonly name: string; readonly args: unknown }, asked: Asked): Promise<Ran> {
      const no = Promise.resolve<Ran>({ ok: false, reason: "refused" });
      if (call.name === digest.name) {
        const args = digest.args.safeParse(call.args);
        return args.success ? digestCard(setup, args.data, asked) : no;
      }
      if (call.name === proposal.name) {
        const args = proposal.args.safeParse(call.args);
        return args.success ? proposalCard(setup, args.data, asked) : no;
      }
      if (call.name !== button.name) return no;
      const args = button.args.safeParse(call.args);
      return args.success ? buttonCard(setup, args.data, asked) : no;
    },
  };
}
