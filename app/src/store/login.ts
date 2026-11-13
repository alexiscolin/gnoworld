// The login's slice of the store (slice 4's merge 4a): who is logged in, where a login under way stands, why
// the last one stopped, and the link to Ergo. Its actions change only what changed, so a subscriber hears a
// change once and nothing else.
import type { Address } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";
import type { ConnectResult, SignResult } from "../lib/adena/adena.ts";
import type { Result } from "../lib/api/login.ts";
import type { ErgoState } from "../lib/ergo/ergo.ts";

type Problem<T> = T extends { ok: false } ? Omit<T, "ok"> : never;
/** Why a login stopped: Adena's answer, the server's, or the page's wallet code that a new version renamed. */
export type LoginProblem =
  Problem<ConnectResult> | Problem<SignResult> | Problem<Result<unknown>> | { reason: "new-version" };
/** A login's steps: Adena asked, the text signed, the proof checked by the server. */
type LoginStep = "idle" | "wallet" | "signing" | "verifying";
type Session = { kind: "unknown" } | { kind: "out" } | { kind: "in"; address: Address };

interface LoginState {
  session: Session;
  step: LoginStep;
  problem: LoginProblem | undefined;
  chat: ErgoState | "off";
}

export interface LoginSlice {
  login: LoginState;
  loginActions: {
    /** A step of a login begins; the last one's problem is forgotten. */
    begin: (step: Exclude<LoginStep, "idle">) => void;
    stopped: (problem: LoginProblem) => void;
    signedIn: (address: Address) => void;
    signedOut: () => void;
    chat: (state: ErgoState | "off") => void;
  };
}

const START: LoginState = { session: { kind: "unknown" }, step: "idle", problem: undefined, chat: "off" };

export const loginSlice: StateCreator<LoginSlice> = (set, get) => {
  // The login's state with these fields changed, set only when one did.
  const change = (next: Partial<LoginState>) => {
    const login = get().login;
    const keys = Object.keys(next) as (keyof LoginState)[];
    if (keys.every((key) => Object.is(login[key], next[key]))) return;
    set({ login: { ...login, ...next } });
  };
  return {
    login: START,
    loginActions: {
      begin: (step) => {
        change({ step, problem: undefined });
      },
      // The reason alone, and the address's problem when there is one: never the failure's other fields.
      stopped: (failure) => {
        const problem: LoginProblem =
          "problem" in failure ? { reason: failure.reason, problem: failure.problem } : { reason: failure.reason };
        change({ step: "idle", problem });
      },
      signedIn: (address) => {
        change({ session: { kind: "in", address }, step: "idle", problem: undefined });
      },
      signedOut: () => {
        change({ session: { kind: "out" }, step: "idle", problem: undefined, chat: "off" });
      },
      chat: (state) => {
        change({ chat: state });
      },
    },
  };
};
