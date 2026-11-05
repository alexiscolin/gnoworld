// The recording of Adena's real answers (slice 9's answer 6): a test-only tool, run by a person with their own Adena on
// Onyx (app/recording). It asks Adena one named call, when told, and keeps the answer as it came; it signs
// nothing itself, Adena asks the person. No page of the app imports it (record.test.ts holds that).
import { CallRequest } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import { CONTRACT_OPTIONS, transaction, type Universe } from "./call.ts";
import { SITE } from "./answers.ts";
import { method } from "./detect.ts";

export type Step =
  | { call: "AddEstablish" | "GetAccount" | "GetNetwork" }
  | { call: "SwitchNetwork"; chainId: string }
  | { call: "DoContract"; request: CallRequest; universe: Universe };
/** What one call was given and what Adena answered, or how it failed to. */
export interface Entry {
  label: string;
  call: string;
  args: unknown[];
  answer?: unknown;
  threw?: string;
}

const argsOf = (step: Step): unknown[] => {
  if (step.call === "AddEstablish") return [SITE];
  if (step.call === "SwitchNetwork") return [step.chainId];
  if (step.call === "DoContract") return [transaction(step.request, step.universe), CONTRACT_OPTIONS];
  return [];
};

/** Asks Adena this one call, once, and keeps its answer as JSON, unchanged. */
export async function record(adena: unknown, label: string, step: Step): Promise<Entry> {
  const args = argsOf(step);
  const run = method(adena, step.call);
  if (run === undefined) return { label, call: step.call, args, threw: "no such method" };
  try {
    const answer: unknown = JSON.parse(JSON.stringify((await run(...args)) ?? null));
    return { label, call: step.call, args, answer };
  } catch (error) {
    return { label, call: step.call, args, threw: String(error) };
  }
}

/** What the recording page's form holds for a call: the account it knows (none yet is ""), and the fields as typed. */
export interface CallForm {
  account: string;
  realm: string;
  func: string;
  args: string;
  universe: Universe;
}
const Answered = z.object({ data: z.object({ address: z.string() }) });
/** The account of a GetAccount entry, or "" when Adena gave none. */
export const accountOf = (entry: Entry): string => {
  const read = Answered.safeParse(entry.answer);
  return read.success ? read.data.data.address : "";
};

/**
 * The page's call step: read the account first when none is known, and call as it, from what the form holds, parsed as a
 * CallRequest like the app's own call (a form that is none is recorded as `threw: "malformed"`, nothing is asked).
 * While no account is known nothing is called: Adena has not let the page in.
 */
export async function recordCall(
  adena: unknown,
  label: string,
  form: CallForm,
): Promise<{ account: string; entries: Entry[] }> {
  const entries: Entry[] = [];
  let account = form.account;
  if (account === "") {
    const read = await record(adena, "account", { call: "GetAccount" });
    entries.push(read);
    account = accountOf(read);
  }
  if (account === "") return { account, entries };
  const request = CallRequest.safeParse({
    chainId: form.universe.chainId,
    caller: account,
    realm: form.realm,
    func: form.func,
    args: form.args === "" ? [] : form.args.split("\n"),
  });
  entries.push(
    request.success
      ? await record(adena, label, { call: "DoContract", request: request.data, universe: form.universe })
      : { label, call: "DoContract", args: [], threw: "malformed" },
  );
  return { account, entries };
}
