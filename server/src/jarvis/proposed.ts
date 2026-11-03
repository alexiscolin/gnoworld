// A proposal's check (backlog row 10: "a proposal for a function that does not exist shows nothing"; ADR-0002 §4, "Proposed
// actions"): the action passes its schema, names a write function of the realm's `vm/qfuncs` and gives exactly that
// function's other parameters, each of a type a call carries as text. Anything else is none, a value and never a throw,
// so a planted message cannot forge a button. The client checks the arguments' values against their types.
import { ProposedAction } from "@gnoworld/schemas";
import type { FunctionList } from "@gnoworld/schemas/functions";

/** Why a proposal shows nothing: not one, no such function, a read one, other arguments, a type no call carries. */
type NoneReason = "shape" | "missing" | "read" | "arguments" | "type";
export type Checked = { ok: true; proposal: ProposedAction } | { ok: false; reason: NoneReason };

type Params = NonNullable<NonNullable<FunctionList>[number]["Params"]>;

// A write function's first parameter is `cur realm`, which `vm/qfuncs` writes as the realm type's base, its methods in order
// (keeper.go:1795 and uverse.go:110 at gno's chain/onyx, printed by running that code): no type of a realm's can name
// `.seal`, so nothing else reads so.
function isWrite(params: Params): boolean {
  const realm = [
    "interface {.seal func(); Address func() .uverse.address; IsCode func() bool; IsCurrent func() bool;",
    "IsEphemeral func() bool; IsUser func() bool; IsUserCall func() bool; IsUserRun func() bool; PkgPath func() string;",
    "Previous func() .uverse.realm; String func() string; Sub func(string) .uverse.realm; Subpath func() string}",
  ].join(" ");
  return params[0]?.Type === realm;
}

// What a call carries from text, as `vm/qfuncs` writes the type: gno's convert.go converts the primitives, `[]byte` and
// `[N]byte`, and refuses any other.
function isCarried(type: string): boolean {
  const primitives = ["bool", "string", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32"];
  return [...primitives, "uint64", "float32", "float64"].includes(type) || /^\[\d*\]uint8$/.test(type);
}

/** The proposal, when it names a write function of `functions` (the `vm/qfuncs` of its realm) with exactly that function's
 * other parameters by name, each of a type a call carries; else none, and why. */
export function checkProposal(proposal: unknown, functions: FunctionList): Checked {
  const parsed = ProposedAction.safeParse(proposal);
  if (!parsed.success) return { ok: false, reason: "shape" };
  const { function: name, args } = parsed.data;
  const found = (functions ?? []).find(({ FuncName }) => FuncName === name);
  if (found === undefined) return { ok: false, reason: "missing" };
  const params = found.Params ?? [];
  if (!isWrite(params)) return { ok: false, reason: "read" };
  const wanted = new Set(params.slice(1).map(({ Name }) => Name));
  const given = Object.keys(args);
  if (given.length !== wanted.size || !given.every((key) => wanted.has(key))) return { ok: false, reason: "arguments" };
  if (!params.slice(1).every(({ Type }) => isCarried(Type))) return { ok: false, reason: "type" };
  return { ok: true, proposal: parsed.data };
}
