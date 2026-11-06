// A stand-in for Adena that answers with the recorded answers (app/recording/adena-recording.json, Alexis on onyx-1,
// 2026-11-05) where the recording has them: the account, the network, the redundant switch, the signed call.
import recording from "../recording/adena-recording.json" with { type: "json" };

type Answer = Record<string, unknown>;
const recorded = (at: number): Answer => ({ ...(recording[at]?.answer as Answer) });
const failure = (type: string, code: number): Answer => ({ status: "failure", type, code, message: "", data: {} });

/** The hash of the recording's signed call. */
export const SIGNED_HASH = "785c189e582beca7c3bccb26afa9ed679bc2a1efc97072dd744d29ce2f83d058";

export interface Recorded {
  /** Every method asked, in order, with its first argument. */
  asked: { call: string; arg?: unknown }[];
  adena: Record<string, (...args: unknown[]) => unknown>;
}

interface Options {
  account: string;
  /** The chain Adena is on; a switch to a known chain moves it. */
  chain?: string;
  known?: readonly string[];
  /** What DoContract answers: the recorded signed call unless said. */
  doContract?: (transaction: unknown) => unknown;
  /** A switch that answers success and moves nothing. */
  stuck?: boolean;
}

export function recordedAdena({
  account,
  chain = "onyx-1",
  known = ["onyx-1", "gnoland-1"],
  doContract,
  stuck = false,
}: Options): Recorded {
  const asked: Recorded["asked"] = [];
  let on = chain;
  const note = (call: string, arg?: unknown) => asked.push(arg === undefined ? { call } : { call, arg });
  const adena: Recorded["adena"] = {
    AddEstablish: () => {
      note("AddEstablish");
      return Promise.resolve({ status: "success", type: "CONNECTION_SUCCESS", code: 0, message: "", data: {} });
    },
    GetAccount: () => {
      note("GetAccount");
      const answer = recorded(0);
      return Promise.resolve({ ...answer, data: { ...(answer["data"] as Answer), address: account, chainId: on } });
    },
    GetNetwork: () => {
      note("GetNetwork");
      const answer = recorded(1);
      return Promise.resolve({ ...answer, data: { ...(answer["data"] as Answer), chainId: on } });
    },
    SwitchNetwork: (id) => {
      note("SwitchNetwork", id);
      if (id === on) return Promise.resolve(recorded(2));
      if (!known.includes(String(id))) return Promise.resolve(failure("UNADDED_NETWORK", 4001));
      if (!stuck) on = String(id);
      return Promise.resolve({ status: "success", type: "SWITCH_NETWORK_SUCCESS", code: 0, message: "", data: {} });
    },
    DoContract: (transaction) => {
      note("DoContract", transaction);
      return doContract === undefined ? Promise.resolve(recorded(3)) : doContract(transaction);
    },
  };
  return { asked, adena };
}
