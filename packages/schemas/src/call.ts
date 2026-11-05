// One call to a realm (slice 9's plan, 9b): the value the call card draws and Adena's message is made from, so
// the preview and the message cannot differ. Strict: no field carries coins, a memo or a fee, so no card can
// hide one and no message can send one. Its caps bound what the card draws and Adena signs (decision D203).
import { z } from "./zod.ts";
import { Address } from "./address.ts";

const CALL_CAPS = { realm: 256, func: 128, args: 32, argBytes: 8192 } as const;

// A chain id as the universes' data spells it: lower case, digits, `_` and `-`, 50 at most (the challenge's cap).
const Chain = z.string().check(z.regex(/^[a-z0-9][a-z0-9_-]{0,49}$/));
// A realm of gno.land: `gno.land/r/` and path segments of lower case, digits and `_` (no dot, so no `..`).
const Realm = z.string().check(z.maxLength(CALL_CAPS.realm), z.regex(/^gno\.land\/r\/[a-z0-9_]+(\/[a-z0-9_]+)*$/));
// An exported function: it starts with a capital, as gno exports it.
const Func = z.string().check(z.maxLength(CALL_CAPS.func), z.regex(/^[A-Z][A-Za-z0-9_]*$/));
// UTF-8 bytes of well-formed text, counted by code point (this package has no TextEncoder).
const bytesOf = (text: string) =>
  Array.from(text).reduce((sum, char) => {
    const code = char.codePointAt(0) ?? 0;
    return sum + (code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4);
  }, 0);
const Argument = z.string().check(z.refine((text) => text.isWellFormed() && bytesOf(text) <= CALL_CAPS.argBytes));

export const CallRequest = z.strictObject({
  chainId: Chain,
  caller: Address,
  realm: Realm,
  func: Func,
  args: z.array(Argument).check(z.maxLength(CALL_CAPS.args)),
});
export type CallRequest = z.infer<typeof CallRequest>;
