// The command-line flow's course, apart from its view (CommandTab.tsx): a code asked for an address, the pasted file posted with the
// logged-in account's own proof for a link, each end said where it belongs (the status line, or the paste box's own error).
import { shortAddress, type Address } from "@gnoworld/schemas";
import { fileShape, type ByProof, type CliChallenge } from "../../lib/api/links.ts";
import type { Result } from "../../lib/api/http.ts";
import { notSigned, PASTE_SHAPE, refusalWords } from "./linkWords.ts";

// A link's code also brings the logged-in account's own block and the chain an Adena signature of it is for.
export type Code = CliChallenge & { byBlock?: string; chainId?: string };
export type Step =
  | { at: "idle" }
  | { at: "asking" }
  | { at: "ready"; code: Code; checking?: true }
  | { at: "stale" }
  | { at: "done"; address: Address };
/** The two calls of a flow: a link's (with a session), a release's or a login's (with none); its button's verb and its code's life. */
export interface Flow {
  kind: "link" | "release" | "login";
  verb: string;
  /** The address box's name: whose address the flow asks for. */
  address: string;
  seconds: number;
  challenge: (address: Address) => Promise<Result<Code>>;
  verify: (request: { nonce: string; address: Address; file: string; by?: ByProof }) => Promise<Result<unknown>>;
}
export interface Say {
  flow: Flow;
  step: (step: Step) => void;
  said: (words: string) => void;
  file: (text: string) => void;
  /** The paste box's own error: a paste that is not the tool's file, or one the server refused. */
  error: (words: string) => void;
}

// A code for the address; `why` says what the last one came to.
export async function ask(address: Address, why: string, { flow, step, said, file }: Say): Promise<void> {
  step({ at: "asking" });
  said(why);
  const made = await flow.challenge(address);
  if (made.ok) {
    file("");
    step({ at: "ready", code: made.value });
  } else if (made.reason === "unauthenticated") step({ at: "stale" });
  else {
    step({ at: "idle" });
    said(refusalWords(flow.kind, made.reason));
  }
}

// The pasted file posted, with the logged-in account's own proof for a link; a refusal gets a new code at once.
export async function link(
  request: { code: Code; address: Address; file: string; by: ByProof | undefined },
  say: Say,
  onLinked: (address: Address) => void,
) {
  const { code, address, file, by } = request;
  if (!fileShape(file)) {
    say.error(PASTE_SHAPE);
    return;
  }
  say.step({ at: "ready", code, checking: true });
  const done = await say.flow.verify({ nonce: code.nonce, address, file, ...(by === undefined ? {} : { by }) });
  if (done.ok) {
    say.step({ at: "done", address });
    onLinked(address);
  } else if (done.reason === "unauthenticated") say.step({ at: "stale" });
  else if (done.reason === "not_found") await ask(address, "This code expired. Here is a new one.", say);
  else if (done.reason === "refused") {
    say.error(
      `${notSigned("cli", shortAddress(address))} Here is a new code. The command changed: copy it again and run it with that key.`,
    );
    await ask(address, "", say);
  } else if (done.reason === "forbidden" || done.reason === "full") {
    say.step({ at: "idle" });
    say.said(refusalWords(say.flow.kind, done.reason));
  } else {
    say.step({ at: "ready", code });
    say.said(refusalWords(say.flow.kind, done.reason));
  }
}

// A link's ready code: the logged-in account and what `AsMe` needs of the code; a release's and a login's have none.
export function asMeOf(me: Address | undefined, ready: { code: Code } | undefined) {
  if (me === undefined || ready === undefined) return undefined;
  const { memo: text, byBlock, chainId } = ready.code;
  return byBlock === undefined || chainId === undefined ? undefined : { me, code: { text, byBlock, chainId } };
}
// A link waits for the logged-in account's own proof, of this code's text.
export const unsigned = (mine: unknown, by: ByProof | undefined): boolean => mine !== undefined && by === undefined;
export const proofOf = (
  mine: { code: { text: string } } | undefined,
  signed: { text: string; by: ByProof } | undefined,
) => (mine !== undefined && signed?.text === mine.code.text ? signed.by : undefined);
