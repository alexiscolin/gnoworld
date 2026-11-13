// One call to a realm (slice 9's plan, 9b): the value the call card draws and Adena's message is made from, so
// the preview and the message cannot differ. Strict: no field carries coins, a memo or a fee, so no card can
// hide one and no message can send one. Its caps bound what the card draws and Adena signs (decision D203).
import { z } from "./zod.ts";
import { Address } from "./address.ts";
import { utf8Bytes } from "@gnoworld/core";
import { hasHidden } from "./hidden.ts";
import { ChainId, RealmPath } from "./realmPath.ts";

const CALL_REQUEST_CAPS = { func: 128, args: 32, argBytes: 8192 } as const;

// An exported function: it starts with a capital, as gno exports it.
const Func = z.string().check(z.maxLength(CALL_REQUEST_CAPS.func), z.regex(/^[A-Z][A-Za-z0-9_]*$/));
// Control and format characters (bidi overrides, zero-width, escapes) but newline and tab are refused: the card would draw text
// unlike the signed bytes (D231).
const Argument = z
  .string()
  .check(
    z.refine(
      (text) =>
        text.isWellFormed() &&
        !hasHidden(text, "\n\t") &&
        utf8Bytes(text, CALL_REQUEST_CAPS.argBytes) <= CALL_REQUEST_CAPS.argBytes,
    ),
  );

export const CallRequest = z.strictObject({
  chainId: ChainId,
  caller: Address,
  realm: RealmPath,
  func: Func,
  args: z.array(Argument).check(z.maxLength(CALL_REQUEST_CAPS.args)),
});
export type CallRequest = z.infer<typeof CallRequest>;
