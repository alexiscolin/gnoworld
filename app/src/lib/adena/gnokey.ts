// The command a call card prints for the command-line tool (D13880): the same MsgCall as Adena's, to copy and run by hand;
// the page never runs it and never watches for it. Flags from gno v1.5.0: keyscli/call.go (pkgpath, func, args, max-deposit),
// keys/client/maketx.go (gas-fee, gas-wanted, broadcast, chainid), keys/client/root.go (remote).
import { hasHidden } from "@gnoworld/core";
import { GAS_FEE, GAS_WANTED } from "./gas.ts";
import { MAX_DEPOSIT } from "./deposit.ts";

// A POSIX shell takes everything between single quotes as it is; a quote of its own is closed, escaped and reopened.
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;
// What a terminal would run as a new line or draw unlike its bytes: no command, rather than one the reader cannot see.
const unquotable = (word: string): boolean => !word.isWellFormed() || hasHidden(word);

/** One line to paste, or the index of the first argument it cannot hold. A value after a flag stays its value even when it
 * starts with a dash: Go's flag package takes the next word whole (flag.go, parseOne). */
export function gnokeyCall(
  call: { realm: string; func: string; args: readonly string[] },
  { chainId, rpc }: { chainId: string; rpc: string },
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
    "KEY",
  ];
  return { ok: true, command: words.join(" ") };
}
