// The recording of Adena's real answers (slice 9's answer 6): a test-only tool, run by a person with their own Adena on
// Onyx (app/recording). It asks Adena one named call, when told, and keeps the answer as it came; it signs
// nothing itself, Adena asks the person. No page of the app imports it (record.test.ts holds that).
import type { CallRequest } from "@gnoworld/schemas";
import { transaction, type Universe } from "./call.ts";
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
  if (step.call === "DoContract") return [transaction(step.request, step.universe)];
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
