// The command a call card prints for the command-line tool: the same MsgCall as Adena's, to copy and run by hand;
// the page never runs it and never watches for it. Flags from gno v1.5.0: keyscli/call.go (pkgpath, func, args, max-deposit),
// keys/client/maketx.go (gas-fee, gas-wanted, broadcast, chainid), keys/client/root.go (remote).
import { hasHidden } from "@gnoworld/core";
import type { Address } from "@gnoworld/schemas";
import { GAS_FEE, GAS_WANTED } from "./gas.ts";
import { MAX_DEPOSIT } from "./deposit.ts";

// A POSIX shell takes everything between single quotes as it is; a quote of its own is closed, escaped and reopened.
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;
/** A quote, which PowerShell ends a single-quoted text on, curly ones included (the split's security review). */
export const QUOTE = /['\u2018-\u201B]/;
// What a terminal would run as a new line or draw unlike its bytes, a backslash, which fish reads inside single quotes as an escape
// (PR #41's security review), and a quote: no command, rather than one a shell reads otherwise. An argument is then single-quoted with
// nothing inside to escape.
const unquotable = (word: string): boolean =>
  !word.isWellFormed() || hasHidden(word) || word.includes("\\") || QUOTE.test(word);

/** One line to paste, signed by `key` (an address, which the tool takes as a key's name; else KEY to replace), or the index of the
 * first argument it cannot hold. A value after a flag stays its value even when it starts with a dash: Go's flag package takes the
 * next word whole (flag.go, parseOne). */
export function gnokeyCall(
  call: { realm: string; func: string; args: readonly string[] },
  { chainId, rpc, key }: { chainId: string; rpc: string; key?: Address | undefined },
): { ok: true; command: string } | { ok: false; argument: number } {
  const argument = call.args.findIndex(unquotable);
  if (argument !== -1) return { ok: false, argument };
  // The realm and the function passed their grammars (RealmPath, an exported name); the chain and its node are the app's own.
  const words = [
    "gnokey maketx call",
    `-pkgpath ${quoted(call.realm)}`,
    `-func ${quoted(call.func)}`,
    ...call.args.map((arg) => `-args ${quoted(arg)}`),
    `-max-deposit ${MAX_DEPOSIT}`,
    `-gas-fee ${String(GAS_FEE)}ugnot`,
    `-gas-wanted ${String(GAS_WANTED)}`,
    "-broadcast",
    `-chainid ${quoted(chainId)}`,
    `-remote ${quoted(rpc)}`,
    key ?? "KEY",
  ];
  return { ok: true, command: words.join(" ") };
}
