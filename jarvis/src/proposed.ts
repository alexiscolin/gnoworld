// A proposal's check (backlog row 10: "a proposal for a function that does not exist shows nothing"; ADR-0002 §4, "Proposed
// actions"): the action passes its schema, names a write function of the realm's `vm/qfuncs` and gives exactly that
// function's other parameters, each of a type a call carries as text. Anything else is none, a value and never a throw,
// so a planted message cannot forge a button. The client checks the arguments' values against their types.
import { callFields } from "@gnoworld/core";
import { ProposedAction } from "@gnoworld/schemas";
import type { FunctionList } from "@gnoworld/schemas/functions";

/** Why a proposal shows nothing: not one, no such function, a read one, other arguments, a type no call carries. */
type NoneReason = "shape" | "missing" | "read" | "arguments" | "type";
export type Checked = { ok: true; proposal: ProposedAction } | { ok: false; reason: NoneReason };

/** The proposal, when it names a write function of `functions` (the `vm/qfuncs` of its realm) with exactly that function's
 * other parameters by name, each of a type a call carries; else none, and why. */
export function checkProposal(proposal: unknown, functions: FunctionList): Checked {
  const parsed = ProposedAction.safeParse(proposal);
  if (!parsed.success) return { ok: false, reason: "shape" };
  const { function: name, args } = parsed.data;
  const found = functions?.find(({ FuncName }) => FuncName === name);
  if (found === undefined) return { ok: false, reason: "missing" };
  const fields = callFields(found.Params);
  if (!fields.ok && fields.why === "read") return { ok: false, reason: "read" };
  const wanted = new Set(found.Params?.slice(1).map(({ Name }) => Name));
  const given = Object.keys(args);
  if (given.length !== wanted.size || !given.every((key) => wanted.has(key))) return { ok: false, reason: "arguments" };
  if (!fields.ok) return { ok: false, reason: "type" };
  return { ok: true, proposal: parsed.data };
}
