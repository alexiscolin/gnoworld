// The call card's one request (9d): the texts typed in the fields become the one CallRequest that builds both the preview and
// Adena's message (lib/adena/call.ts), so the card cannot show one call and sign another.
import { callFields, type Param, type Problem } from "@gnoworld/core";
import type { Address, CallRequest } from "@gnoworld/schemas";
import { problemsOf } from "./problems.ts";

interface Typed {
  realm: string;
  func: string;
  params: readonly Param[];
  texts: readonly string[];
}

export type Built = { ok: true; request: CallRequest } | { ok: false; problems: (Problem | undefined)[] };

/** The request of a card's texts as `caller` on `chainId`, or the problem of each field and no request. The caps and the shapes are
 * read again where Adena is asked (lib/adena/call.ts): this chunk carries none of that schema. */
export function callRequest(card: Typed, { chainId, caller }: { chainId: string; caller: Address }): Built {
  const problems = problemsOf(card);
  const fields = callFields(card.params);
  if (!fields.ok || card.texts.length > fields.fields.length || problems.some((problem) => problem !== undefined))
    return { ok: false, problems };
  return { ok: true, request: { chainId, caller, realm: card.realm, func: card.func, args: [...card.texts] } };
}
