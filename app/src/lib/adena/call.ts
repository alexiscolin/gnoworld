// One call to a realm through Adena: the request the card drew, the account and the network
// read again right before signing, one MsgCall, and the answer read as outside data. Every end is a result with
// its reason, and nothing is asked of Adena for the request until those asked before it have answered (queue.ts).
import { Address, CallRequest } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import { method } from "./detect.ts";
import {
  Account,
  ask,
  capped,
  Network,
  read,
  refusal,
  SITE,
  type Method,
  type Answered,
  type CallFailure,
  type Failed,
} from "./answers.ts";
import { MAX_DEPOSIT } from "./deposit.ts";
import { GAS_FEE, GAS_WANTED } from "./gas.ts";
import { serially } from "./queue.ts";

export type CallResult =
  { ok: true; hash: string; log: string } | { ok: false; reason: CallFailure; log?: string; hash?: string };
/** The chain a call is for, as app/data/universes.json names it: what AddNetwork needs. */
export interface Universe {
  chainId: string;
  name: string;
  rpc: string;
}

type Need = (name: Method, ...args: unknown[]) => Promise<Answered>;
interface Wallet {
  establish: (...args: unknown[]) => unknown;
  getAccount: (...args: unknown[]) => unknown;
  getNetwork: (...args: unknown[]) => unknown;
  doContract: (...args: unknown[]) => unknown;
  need: Need;
}

// The extension and the methods every call needs; the ones only some steps need are asked for by `need`.
function open(adena: unknown): Wallet | Failed {
  const establish = method(adena, "AddEstablish");
  const getAccount = method(adena, "GetAccount");
  const getNetwork = method(adena, "GetNetwork");
  const doContract = method(adena, "DoContract");
  if (establish === undefined) return refusal("missing");
  if (getAccount === undefined || getNetwork === undefined || doContract === undefined) return refusal("outdated");
  // An extension without a method only some steps need is too old when that step comes.
  const need: Need = (name, ...args) => {
    const run = method(adena, name);
    return run === undefined ? Promise.resolve(refusal("outdated")) : ask(() => run(...args), name);
  };
  return { establish, getAccount, getNetwork, doContract, need };
}

// Adena's account must be the call's caller: the person chose that account in gnoworld.
async function checkAccount(wallet: Wallet, caller: string): Promise<Failed | undefined> {
  const account = () => read(() => wallet.getAccount(), "GetAccount", Account);
  let who = await account();
  if (!who.ok && who.reason === "not-connected") {
    // A refused connection comes back with no error at all: the state is read again, never assumed.
    const letIn = await ask(() => wallet.establish(SITE), "AddEstablish");
    if (!letIn.ok) return letIn;
    who = await account();
  }
  if (!who.ok) return who;
  if (!Address.safeParse(who.value.address).success) return refusal("malformed");
  return who.value.address === caller ? undefined : refusal("wrong-account");
}

// The network is read right before signing and must be the universe's, switched or added if not; still wrong, stop.
async function checkNetwork(wallet: Wallet, universe: Universe): Promise<Failed | undefined> {
  const network = () => read(() => wallet.getNetwork(), "GetNetwork", Network);
  const on = await network();
  if (!on.ok) return on;
  if (on.value.chainId === universe.chainId) return undefined;
  const stopped = await switchTo(wallet.need, universe);
  if (stopped !== undefined) return stopped;
  const again = await network();
  if (!again.ok) return again;
  return again.value.chainId === universe.chainId ? undefined : refusal("wrong-network");
}

async function work(adena: unknown, request: CallRequest, universe: Universe): Promise<CallResult | Failed> {
  const wallet = open(adena);
  if ("ok" in wallet) return wallet;
  const stopped = (await checkAccount(wallet, request.caller)) ?? (await checkNetwork(wallet, universe));
  return stopped ?? send(wallet.doContract, request, universe);
}

// Moves Adena to the universe's chain: switch, or add it then switch. A failure ends it; undefined, the chain is read again.
async function switchTo(need: Need, { chainId, name, rpc }: Universe): Promise<Failed | undefined> {
  const switched = await need("SwitchNetwork", chainId);
  if (switched.ok || switched.type === "REDUNDANT_CHANGE_REQUEST") return undefined;
  if (switched.type !== "UNADDED_NETWORK") return switched;
  const added = await need("AddNetwork", { chainId, chainName: name, rpcUrl: rpc });
  if (!added.ok) return added;
  const again = await need("SwitchNetwork", chainId);
  if (again.ok || again.type === "REDUNDANT_CHANGE_REQUEST") return undefined;
  return again.type === "UNADDED_NETWORK" ? refusal("wrong-network") : again;
}

/** What DoContract is given: the request's one MsgCall, no coins, no memo, the fixed deposit cap; pinned to the universe's chain and node. */
// A declaration, not an arrow in a const: StrykerJS's runner never reloads a module, so a mutant of a const set at load lived on.
function transaction(request: CallRequest, { chainId, rpc }: Universe) {
  return {
    messages: [
      {
        type: "/vm.m_call",
        value: {
          caller: request.caller,
          send: "",
          max_deposit: MAX_DEPOSIT,
          pkg_path: request.realm,
          func: request.func,
          args: [...request.args],
        },
      },
    ],
    gasFee: GAS_FEE,
    gasWanted: GAS_WANTED,
    networkInfo: { chainId, rpcUrl: rpc },
  };
}

// Once DoContract was asked, the popup may have broadcast whatever came back: so says a failure but a lock or a pending
// request, any naming a hash, an account switched mid-send, and a refusal, as closing the window after Confirm answers
// TRANSACTION_REJECTED (approve-transaction-main/index.tsx:841-844).
const SENT_MAYBE: readonly CallFailure[] = ["failed", "malformed", "wrong-account"];
const maybeSent = (failure: Failed): Failed => {
  if (failure.hash !== undefined || SENT_MAYBE.includes(failure.reason)) return { ...failure, reason: "maybe-sent" };
  return failure.reason === "declined" ? { ...failure, reason: "declined-maybe-sent" } : failure;
};
/** DoContract's options: no result screen, so the popup closes itself once sent and no cross can close it then. */
const CONTRACT_OPTIONS = { isVisibleResult: false } as const;

async function send(
  doContract: (...args: unknown[]) => unknown,
  request: CallRequest,
  universe: Universe,
): Promise<CallResult | Failed> {
  // As Adena's extension answers, not as the SDK's types say: a hex hash and the realm's Log, with no height and no
  // check_tx or deliver_tx.
  const Sent = z.object({ hash: z.string().check(z.regex(/^[0-9a-f]{64}$/i)), Log: z.string(), error: z.unknown() });
  // Reading the answer can throw too (a hostile getter): once asked, any throw is maybe-sent, never a call to try again.
  const done = await read(() => doContract(transaction(request, universe), CONTRACT_OPTIONS), "DoContract", Sent).catch(
    () => refusal("maybe-sent"),
  );
  if (!done.ok) return maybeSent(done);
  const { hash, Log, error } = done.value;
  return error === null ? { ok: true, hash, log: capped(Log) } : { ...refusal("maybe-sent", "", Log), hash };
}

/** Asks Adena, once the requests before it are done, to sign and send this call, as the account on the universe's chain. */
export function callContract(adena: unknown, request: CallRequest, universe: Universe): Promise<CallResult> {
  // A typed request is not a checked one: the caps and the shapes the card shows are read again where Adena is asked.
  const parsed = CallRequest.safeParse(request);
  if (!parsed.success) return Promise.resolve({ ok: false, reason: "malformed" });
  if (parsed.data.chainId !== universe.chainId) return Promise.resolve({ ok: false, reason: "wrong-network" });
  return serially(async () => {
    try {
      const result = await work(adena, parsed.data, universe);
      if (result.ok) return result;
      const { reason, log, hash } = result;
      return { ok: false, reason, ...(log === undefined ? {} : { log }), ...(hash === undefined ? {} : { hash }) };
    } catch {
      return { ok: false, reason: "failed" };
    }
  });
}
