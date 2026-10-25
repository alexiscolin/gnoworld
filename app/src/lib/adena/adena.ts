// The browser's half of the login's signature (slice 4's merge 4a, decision 139): Adena's extension, read
// as outside data. Its calls and answers as @adena-wallet/sdk 0.1.1 types and tables them (window.adena,
// AdenaResponse; bin/index.js:636-990): an answer is read by its type, as the SDK reads it, never by its
// status alone, since "already connected" comes as a failure. Whatever the extension does, a call here
// resolves to a result: a getter or a proxy that throws included.
import { Address, ADDRESS_PROBLEMS, ChallengeRequest, Proof, type AddressProblem } from "@gnoworld/schemas";
import { z } from "../jitless.ts";

/** The most Adena signs, in UTF-8 bytes: it carries the text in its popup's URL (the SDK's MAX_ARBITRARY_MESSAGE_BYTES). */
export const MAX_TEXT_BYTES = 4096;
const SITE = "gnoworld";

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

const Answer = z.object({ status: z.enum(["success", "failure"]), type: z.string(), data: z.unknown() });
const Account = z.object({ address: z.string(), chainId: z.string() });
// The chain as the server's challenge takes it, not blank.
const Chain = ChallengeRequest.shape.chainId.refine((chain) => chain.trim() !== "");
const Network = z.object({ chainId: Chain });
const MSG_TYPE = "sign/MsgSignData";

// What a failure's type tells the person; any other is Adena's own failure.
const FAILURES: Record<string, Refusal | "mismatch"> = {
  CONNECTION_REJECTED: "declined",
  SIGN_REJECTED: "declined",
  WALLET_LOCKED: "locked",
  NO_ACCOUNT: "no-account",
  ACCOUNT_MISMATCH: "mismatch",
};
// The success types of each call; Adena's GetNetwork answers GET_NETWORK (the SDK's table), its types say
// GET_NETWORK_SUCCESS: either is taken until the real extension says which (slice 4's plan, 4a).
const SUCCESSES = new Set([
  "CONNECTION_SUCCESS",
  "ALREADY_CONNECTED",
  "GET_ACCOUNT",
  "GET_NETWORK",
  "GET_NETWORK_SUCCESS",
  "SIGN_ARBITRARY",
]);

type Read = { ok: true; data: unknown } | { ok: false; reason: Refusal | "mismatch" };

class Failure extends Error {
  readonly reason: Refusal;
  constructor(reason: Refusal) {
    super(reason);
    this.reason = reason;
  }
}

// One read of a method: an object's key read twice may answer twice differently.
function method(adena: unknown, name: string): ((...args: unknown[]) => unknown) | undefined {
  if (typeof adena !== "object" || adena === null) return undefined;
  const found: unknown = Reflect.get(adena, name);
  if (typeof found !== "function") return undefined;
  return (...args: unknown[]): unknown => {
    const result: unknown = Reflect.apply(found, adena, args);
    return result;
  };
}

// A call's answer, by its type: one of the call's own successes, a failure the person can act on, or Adena's.
async function call(run: () => unknown, successes: readonly string[]): Promise<Read> {
  let raw: unknown;
  try {
    raw = await run();
  } catch {
    throw new Failure("failed");
  }
  const answer = Answer.safeParse(raw);
  if (!answer.success) return { ok: false, reason: "malformed" };
  const { status, type, data } = answer.data;
  // "Already connected" is a failure in the SDK's table, and the SDK reads it as connected.
  if (successes.includes(type) && (status === "success" || type === "ALREADY_CONNECTED")) return { ok: true, data };
  if (status === "success" || SUCCESSES.has(type)) return { ok: false, reason: "malformed" };
  return { ok: false, reason: FAILURES[type] ?? "failed" };
}

// The whole of a call to the extension: anything it throws, at any step, is a result.
async function guarded<T>(work: () => Promise<T>, fail: (reason: Refusal) => T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return fail(error instanceof Failure ? error.reason : "failed");
  }
}

// The three calls connect makes, in order, each stopping at its first refusal.
async function ask(
  adena: unknown,
): Promise<{ ok: true; account: unknown; network: unknown } | { ok: false; reason: Refusal }> {
  const establish = method(adena, "AddEstablish");
  const account = method(adena, "GetAccount");
  const network = method(adena, "GetNetwork");
  if (establish === undefined || account === undefined || network === undefined)
    return { ok: false, reason: "missing" };
  const letIn = await call(() => establish(SITE), ["CONNECTION_SUCCESS", "ALREADY_CONNECTED"]);
  if (!letIn.ok) return { ok: false, reason: refusal(letIn.reason) };
  const read = await call(() => account(), ["GET_ACCOUNT"]);
  if (!read.ok) return { ok: false, reason: refusal(read.reason) };
  const on = await call(() => network(), ["GET_NETWORK", "GET_NETWORK_SUCCESS"]);
  return on.ok ? { ok: true, account: read.data, network: on.data } : { ok: false, reason: refusal(on.reason) };
}

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
  return guarded<ConnectResult>(
    async () => {
      const answers = await ask(adena);
      return answers.ok ? connected(answers.account, answers.network) : answers;
    },
    (reason) => ({ ok: false, reason }),
  );
}

const refusal = (reason: Refusal | "mismatch"): Refusal => (reason === "mismatch" ? "failed" : reason);
const isProblem = (message: string | undefined): message is AddressProblem =>
  ADDRESS_PROBLEMS.some((problem) => problem === message);

/** Has Adena sign the server's text, unchanged, as the account on the chain; the proof is checked to be of that. */
export function signLogin(adena: unknown, login: Login): Promise<SignResult> {
  const { address, text } = login;
  return guarded<SignResult>(
    async () => {
      if (method(adena, "AddEstablish") === undefined) return { ok: false, reason: "missing" };
      const sign = method(adena, "SignArbitrary");
      if (sign === undefined) return { ok: false, reason: "outdated" };
      if (text === "" || !text.isWellFormed()) return { ok: false, reason: "malformed" };
      const bytes = new TextEncoder().encode(text);
      if (bytes.length > MAX_TEXT_BYTES) return { ok: false, reason: "too-long" };
      const signed = await call(() => sign({ signer: address, data: text }), ["SIGN_ARBITRARY"]);
      if (!signed.ok) return { ok: false, reason: signed.reason };
      const proof = Proof.safeParse(signed.data);
      if (!proof.success) return { ok: false, reason: "malformed" };
      return isProofOf(proof.data, login, bytes) ? { ok: true, proof: proof.data } : { ok: false, reason: "mismatch" };
    },
    (reason) => ({ ok: false, reason }),
  );
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
