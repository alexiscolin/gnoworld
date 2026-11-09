// A room's name checked as a message of its world is (D394): the world's rules read it as words (hyphens as spaces), then the
// provider; a name the provider could not read is left unchecked, which the route answers by refusing, never by making the room.
import type { Rules } from "../roles/roles.ts";
import { decide, type Thresholds } from "./decide.ts";
import type { Answer } from "./provider.ts";
import { ruleVerdict } from "./rules.ts";

interface Options {
  rulesOf: (world: string) => Rules | undefined;
  // None without a key: every name is then unchecked.
  provider: ((text: string) => Promise<Answer | "unchecked">) | undefined;
  thresholds: Thresholds;
}

export type NameVerdict = "pass" | "hide" | "unchecked";

export function makeNameChecker({ rulesOf, provider, thresholds }: Options) {
  return async (world: string, name: string): Promise<NameVerdict> => {
    const rules = rulesOf(world);
    // A world the file does not name has no rules to read a name by.
    if (rules === undefined) return "hide";
    const words = name.replaceAll("-", " ");
    if (ruleVerdict(words, rules, { newAccount: false }) !== undefined) return "hide";
    if (provider === undefined) return "unchecked";
    const answer = await provider(words);
    if (answer === "unchecked") return "unchecked";
    return decide(answer, thresholds).action === "hide" ? "hide" : "pass";
  };
}
