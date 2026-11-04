// The cases as promptfoo's tests (promptfoo 0.125.1 reads a TypeScript tests file's default export, and calls a
// function-valued `javascript` assertion with the output and a context whose `metadata` is the provider's): each
// expectation an assertion, the rubric graded by the config's grader, a model that answers none of them.
import { readCases, type Case, type Expect } from "./cases.ts";

interface Verdict {
  pass: boolean;
  score: number;
  reason: string;
}
type Check = (output: string, context: { metadata?: Record<string, unknown> }) => Verdict;
interface Assertion {
  type: string;
  value?: string | Check;
  threshold?: number;
}

const verdict = (pass: boolean, reason: string): Verdict => ({ pass, score: pass ? 1 : 0, reason });
const listed = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** The assertions of one case's expectations, in the order a reader of the results checks them. */
export function assertionsOf(expect: Expect): Assertion[] {
  const checks: Assertion[] = [];
  const check = (value: Check) => checks.push({ type: "javascript", value });
  check((_, { metadata }) => {
    const status = String(metadata?.["status"]);
    return verdict(expect.status.includes(status), `status ${status}, wanted ${expect.status.join(" or ")}`);
  });
  // An answer the model gave is traced: a case that saw no span cannot say which tools ran (10j's review, S2).
  if (expect.status.includes("answered"))
    check((_, { metadata }) => verdict(Number(metadata?.["made"]) >= 1, "no question span came back"));
  if (expect.never_tools !== undefined) {
    const never = expect.never_tools;
    check((_, { metadata }) => {
      if (!(Number(metadata?.["made"]) >= 1)) return verdict(false, "no span came back: what ran is unknown");
      const ran = listed(metadata?.["tools"]).filter((tool) => never.includes(tool));
      return verdict(ran.length === 0, `ran ${ran.join(", ") || "none of"} ${never.join(", ")}`);
    });
  }
  if (expect.some_tools !== undefined) {
    const some = expect.some_tools;
    check((_, { metadata }) => {
      const ran = listed(metadata?.["tools"]);
      return verdict(
        some.some((tool) => ran.includes(tool)),
        `ran ${ran.join(", ") || "nothing"}, wanted one of ${some.join(", ")}`,
      );
    });
  }
  for (const word of expect.contains ?? []) checks.push({ type: "icontains", value: word });
  for (const word of expect.lacks ?? []) checks.push({ type: "not-icontains", value: word });
  if (expect.made_at_most !== undefined) {
    const most = expect.made_at_most;
    check((_, { metadata }) => {
      const made = Number(metadata?.["made"]);
      return verdict(made <= most, `made ${String(made)}, at most ${String(most)}`);
    });
  }
  if (expect.proposal === "none")
    check((_, { metadata }) => verdict(metadata?.["proposal"] === null, "a proposal was kept"));
  if (expect.rubric !== undefined) checks.push({ type: "llm-rubric", value: expect.rubric });
  if (expect.max_usd !== undefined) checks.push({ type: "cost", threshold: expect.max_usd });
  if (expect.max_ms !== undefined) checks.push({ type: "latency", threshold: expect.max_ms });
  return checks;
}

const testOf = (one: Case & { suite: string }) => ({
  description: `${one.suite}/${one.id}: ${one.about}`,
  vars: { case: JSON.stringify(one), about: one.about },
  assert: assertionsOf(one.expect),
});

export default function tests() {
  return readCases(new URL("cases", import.meta.url).pathname).map(testOf);
}
