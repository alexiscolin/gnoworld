// Tier 1 (docs/REVIEW.md). What follows `$help` in a realm page's link to its own function (slice 13, D13300), as gno's txlink writes it
// (gno.land/p/moul/txlink/v0: `$help&func=<Name>` then Go's url.Values encoding), read into a call by name: a card shows it and signs
// nothing alone, and no send amount ever comes from a link (`send`, and any `.` key, txlink's `.send` among them, is dropped).
import { isExportedName } from "../chain/exportedName.ts";
import { textProblem } from "./args.ts";

export interface HelpArg {
  name: string;
  value: string;
}
export interface HelpCall {
  func: string;
  args: HelpArg[];
}

/** The most pairs a link's call holds, its function's and a dropped send's among them. */
export const MAX_HELP_ARGS = 32;

// A key or a value as Go's url.Values encodes it (`+` a space, `%XX` a byte of UTF-8), or undefined for one that is no such text.
function decoded(text: string): string | undefined {
  try {
    return decodeURIComponent(text.replaceAll("+", " "));
  } catch {
    return undefined;
  }
}

// A `key=value` pair, both decoded; undefined for one with no `=` or a part that does not decode.
function pairOf(pair: string): HelpArg | undefined {
  const at = pair.indexOf("=");
  const name = at === -1 ? undefined : decoded(pair.slice(0, at));
  const value = decoded(pair.slice(at + 1));
  return name === undefined || value === undefined ? undefined : { name, value };
}

// The arguments after the function: each key once, a send and the `.` keys dropped, the rest identifiers with clean values; else undefined.
function argsOf(pairs: readonly (HelpArg | undefined)[]): HelpArg[] | undefined {
  const args: HelpArg[] = [];
  const seen = new Set(["func"]);
  for (const pair of pairs) {
    if (pair === undefined || seen.has(pair.name)) return undefined;
    seen.add(pair.name);
    if (pair.name === "send" || pair.name.startsWith(".")) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(pair.name) || textProblem(pair.value) !== undefined) return undefined;
    args.push(pair);
  }
  return args;
}

/** The call a `$help` link names, from what follows `$help`: `&func=<Name>` first, then each argument once by its identifier, its value
 * clean (textProblem); undefined for anything else, which the page shows as the link's words. */
export function helpCall(query: string): HelpCall | undefined {
  const parts = query.split("&", MAX_HELP_ARGS + 2);
  if (parts.length > MAX_HELP_ARGS + 1 || parts.shift() !== "") return undefined;
  const [first, ...rest] = parts.map(pairOf);
  const func = first?.name === "func" ? first.value : undefined;
  const args = func !== undefined && isExportedName(func) ? argsOf(rest) : undefined;
  return func === undefined || args === undefined ? undefined : { func, args };
}

/** The text each field of a card opens with, from a link's arguments: its own by name, else an empty one. */
export function prefill(fields: readonly { name: string }[], args: readonly HelpArg[]): string[] {
  return fields.map(({ name }) => args.find((arg) => arg.name === name)?.value ?? "");
}
