// The browser's half of the login's signature (slice 4's merge 4a, decision 139): Adena's extension, read
// as outside data. Its calls and answers as @adena-wallet/sdk 0.1.1 types and tables them (window.adena,
// AdenaResponse; bin/index.js:636-990): an answer is read by its type, as the SDK reads it, never by its
// status alone, since "already connected" comes as a failure. Whatever the extension does, a call here
// resolves to a result: a getter or a proxy that throws included.
import { Address, ADDRESS_PROBLEMS, Proof, type AddressProblem } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import { detect, isOlder, method, MIN_SIGN_IN } from "./detect.ts";
import { Account, ask, Network, SITE, type CallFailure } from "./answers.ts";
import { serially } from "./queue.ts";

/** The most Adena signs, in UTF-8 bytes: it carries the text in its popup's URL (the SDK's MAX_ARBITRARY_MESSAGE_BYTES). */
export const MAX_TEXT_BYTES = 4096;

type Refusal = "missing" | "declined" | "locked" | "no-account" | "failed" | "malformed";
interface Connected {
  ok: true;
  address: Address;
  chainId: string;
}
/** What the server asked Adena to sign: its text, unchanged, as this account on this chain. */
export interface Login {
  address: Address;
  chainId: string;
  text: string;
}
export type ConnectResult =
  Connected | { ok: false; reason: Refusal } | { ok: false; reason: "address"; problem: AddressProblem };
export type SignResult =
  { ok: true; proof: Proof } | { ok: false; reason: Refusal | "outdated" | "too-long" | "mismatch" };

const MSG_TYPE = "sign/MsgSignData";

// The reasons of the one reader of Adena's answers (answers.ts), as the login tells them: what it cannot act on is failed.
const REASONS = new Set<CallFailure>(["missing", "declined", "locked", "no-account", "malformed"]);
const refusal = (reason: CallFailure): Refusal => (REASONS.has(reason) ? (reason as Refusal) : "failed");

// The account and the chain, from Adena's two answers: one chain for both, and a gno address, or why not.
function connected(account: unknown, network: unknown): ConnectResult {
  const who = Account.safeParse(account);
  const where = Network.safeParse(network);
  if (!who.success || !where.success || who.data.chainId !== where.data.chainId)
    return { ok: false, reason: "malformed" };
  const address = Address.safeParse(who.data.address);
  if (address.success) return { ok: true, address: address.data, chainId: where.data.chainId };
  const problem = address.error.issues[0]?.message;
  return isProblem(problem) ? { ok: false, reason: "address", problem } : { ok: false, reason: "malformed" };
}

/** Lets gnoworld in, then reads the account and the chain Adena is on: the network's, which it signs for. */
export function connect(adena: unknown): Promise<ConnectResult> {
  return serially(async () => {
    try {
      const establish = method(adena, "AddEstablish");
      const account = method(adena, "GetAccount");
      const network = method(adena, "GetNetwork");
      if (establish === undefined || account === undefined || network === undefined)
        return { ok: false, reason: "missing" };
      // Each call stops the rest at its first refusal.
      const letIn = await ask(() => establish(SITE), ["CONNECTION_SUCCESS", "ALREADY_CONNECTED"]);
      if (!letIn.ok) return { ok: false, reason: refusal(letIn.reason) };
      const who = await ask(() => account(), ["GET_ACCOUNT"]);
      if (!who.ok) return { ok: false, reason: refusal(who.reason) };
      const on = await ask(() => network(), ["GET_NETWORK", "GET_NETWORK_SUCCESS"]);
      return on.ok ? connected(who.data, on.data) : { ok: false, reason: refusal(on.reason) };
    } catch {
      return { ok: false, reason: "failed" };
    }
  });
}

const isProblem = (message: string | undefined): message is AddressProblem =>
  ADDRESS_PROBLEMS.some((problem) => problem === message);

type Ready =
  { ok: true; sign: (...args: unknown[]) => unknown; bytes: Uint8Array } | { ok: false; reason: SignFailure };
type SignFailure = Extract<SignResult, { ok: false }>["reason"];

// What signing needs, in the order it is missing: Adena, a version, the method, then the text.
function ready(adena: unknown, text: string): Ready {
  const found = detect(adena);
  if (!found.ok) return found;
  const sign = isOlder(found.version, MIN_SIGN_IN) ? undefined : method(adena, "SignArbitrary");
  if (sign === undefined) return { ok: false, reason: "outdated" };
  if (text === "" || !text.isWellFormed()) return { ok: false, reason: "malformed" };
  const bytes = new TextEncoder().encode(text);
  return bytes.length > MAX_TEXT_BYTES ? { ok: false, reason: "too-long" } : { ok: true, sign, bytes };
}

/** Has Adena sign the server's text, unchanged, as the account on the chain; the proof is checked to be of that. */
export function signLogin(adena: unknown, login: Login): Promise<SignResult> {
  const { address, text } = login;
  return serially(async () => {
    try {
      const prepared = ready(adena, text);
      if (!prepared.ok) return prepared;
      const signed = await ask(() => prepared.sign({ signer: address, data: text }), ["SIGN_ARBITRARY"]);
      if (!signed.ok)
        return { ok: false, reason: signed.reason === "wrong-account" ? "mismatch" : refusal(signed.reason) };
      const proof = Proof.safeParse(signed.data);
      if (!proof.success) return { ok: false, reason: "malformed" };
      return isProofOf(proof.data, login, prepared.bytes)
        ? { ok: true, proof: proof.data }
        : { ok: false, reason: "mismatch" };
    } catch {
      return { ok: false, reason: "failed" };
    }
  });
}

const SignedMessage = z.object({
  type: z.literal(MSG_TYPE),
  value: z.object({ signer: z.string(), data: z.string() }),
});

// The ADR-036 document of exactly this signer, chain and text (the SDK's makeArbitrarySignDoc): one message.
function isProofOf(proof: Proof, { address, chainId }: Login, bytes: Uint8Array): boolean {
  const [message, ...more] = proof.signed.msgs;
  const read = SignedMessage.safeParse(message);
  return (
    more.length === 0 &&
    read.success &&
    proof.signed.chain_id === chainId &&
    read.data.value.signer === address &&
    read.data.value.data === btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
  );
}

/** The page's window.adena, as it is: what connect and signLogin read, with whatever an extension put there. */
export const pageAdena = (): unknown => Reflect.get(globalThis, "adena");
