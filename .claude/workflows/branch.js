export const meta = {
  name: "branch",
  description:
    "One branch of a slice, from its failing tests to a reviewed merge check: tests, red pass, code, merge check, one combined review, high and medium fixes",
  whenToUse:
    'A branch session runs it once its worktree and brief exist (docs/HARNESS.md, "Who does what"); the chief reads what it returns.',
  phases: [
    { title: "Tests", detail: "the failing tests, seen failing" },
    { title: "Red pass", detail: "the test-auditor, once per branch" },
    { title: "Build", detail: "the red pass's findings, then the code, a commit per behaviour" },
    { title: "Merge check", detail: "check.sh --merge, the failing lane alone until it passes" },
    {
      title: "Review",
      detail: "the reviewer; the security-reviewer for tier 1 or the harness; the gno-auditor for a realm",
    },
    { title: "Verify", detail: "the finding-verifier on tier-1 findings" },
    { title: "Fix", detail: "high and medium findings, test first; low ones listed for Alexis" },
  ],
};

// args: { branch, worktree, plan, brief, shared, tier1, realm }. shared is the slice's folder of shared files in the main
// checkout (.claude/tmp/slice-<n>): learnings.md, <branch>.state.md, reports/. tier1 and realm say which reviews to add.
const A = args;
const SEVERITY = { type: "string", enum: ["high", "medium", "low"] };
const FINDINGS = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          severity: SEVERITY,
          file: { type: "string" },
          scenario: { type: "string" },
          evidence: { type: "string" },
          fix: { type: "string" },
          beyondPlan: { type: "boolean" },
        },
        required: ["id", "severity", "file", "scenario", "evidence", "fix", "beyondPlan"],
      },
    },
  },
  required: ["findings"],
};
const TESTS = {
  type: "object",
  properties: {
    files: { type: "array", items: { type: "string" } },
    seenFailing: { type: "boolean" },
    notes: { type: "string" },
  },
  required: ["files", "seenFailing", "notes"],
};
const DONE = {
  type: "object",
  properties: { commits: { type: "array", items: { type: "string" } }, notes: { type: "string" } },
  required: ["commits", "notes"],
};
const GATE = {
  type: "object",
  properties: {
    passed: { type: "boolean" },
    failingLane: { type: "string" },
    tail: { type: "string" },
    survivors: { type: "array", items: { type: "string" } },
    seconds: { type: "number" },
  },
  required: ["passed", "failingLane", "tail", "survivors", "seconds"],
};
const VERDICTS = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["reproduced", "refuted", "unverified"] },
          severity: SEVERITY,
        },
        required: ["id", "verdict", "severity"],
      },
    },
  },
  required: ["verdicts"],
};

// What every agent of the loop is told: where it works, what it reads, and the shared files it leaves its trace in.
const where = (step) =>
  `Branch ${A.branch}, worktree ${A.worktree}: work there alone, \`cd "${A.worktree}" || exit 1\` before any command. ` +
  `The slice plan: ${A.plan}. This branch's brief: ${A.brief}. Your step: ${step}. ` +
  `When you learn something a later branch should know (a flaky test, a wrong assumption, a tool's trap), append one dated line to ${A.shared}/learnings.md. ` +
  `When you finish, append one line to ${A.shared}/${A.branch}.state.md (the step, what it did, its commits) and save your report to ${A.shared}/reports/${A.branch}-${step}.md. ` +
  "rtk swallows git's output written to a file: write a diff to a file through python3's subprocess.";

const gateCheck = () =>
  agent(
    `${where("merge-check")}. Run \`sh scripts/check.sh --merge\` (minutes) and time it. Report whether it passed, the failing lane and the tail of its output, ` +
      "and the surviving mutants it printed (StrykerJS's and harness_mutate's). Read .claude/tmp/unsteady.log: give each file named a ledger row " +
      "(docs/review/findings.md) and a line in the learnings, then delete the log. Change no code.",
    // An agent that runs a command and waits for it: the cheaper model, little reasoning.
    { phase: "Merge check", label: "merge check", schema: GATE, model: "sonnet", effort: "low" },
  );

phase("Tests");
const tests = await agent(
  `${where("tests")}. Write the failing tests the brief calls for, test first (CLAUDE.md), and run them: each must fail for the reason it names. ` +
    "Write no product code and commit nothing.",
  { label: "tests", schema: TESTS },
);
if (!tests || !tests.seenFailing)
  return { branch: A.branch, status: "blocked at the tests", tokens: budget.spent(), tests };

phase("Red pass");
const red = await agent(`Red pass. ${where("red-pass")}. The failing tests, uncommitted: ${tests.files.join(", ")}.`, {
  agentType: "test-auditor",
  label: "red pass",
  schema: FINDINGS,
});

phase("Build");
const built = await agent(
  `${where("build")}. First fix the red pass's findings in the tests: ${JSON.stringify(red ? red.findings : [])}. ` +
    "Then write the code until they pass. Commit each behaviour with its tests (the fast gate runs at each commit: a refused commit is fixed, never " +
    "bypassed); the commit that brings the tests says `Red-pass: <the findings fixed>`.",
  { label: "build", schema: DONE },
);

const commits = [...(built ? built.commits : [])];
const low = [];
const judged = [];
let gate = null;
let round = 0;
while (round < 3) {
  round += 1;
  gate = await gateCheck();
  for (let tries = 0; gate && !gate.passed && tries < 2; tries += 1) {
    const fixed = await agent(
      `${where("gate-fix")}. The merge check failed in its ${gate.failingLane} lane:\n${gate.tail}\n` +
        "Run that lane's commands alone, find the cause and fix it, test first for a bug of the product. A test that fails once and passes alone " +
        "is a flaky one: a ledger row and a learnings line, not a retry. Never change a test to make code pass without saying so in its commit. Commit.",
      { phase: "Merge check", label: `gate fix ${tries + 1}`, schema: DONE },
    );
    if (fixed) commits.push(...fixed.commits);
    gate = await gateCheck();
  }
  if (!gate || !gate.passed)
    return {
      branch: A.branch,
      status: "blocked at the merge check",
      tokens: budget.spent(),
      gate,
      commits,
      low,
      judged,
    };

  phase("Review");
  const since = round === 1 ? "main" : `the last round (round ${round - 1})`;
  // [agent type, label, what it is asked]: the reviewer always, the security-reviewer for tier 1, the gno-auditor for a realm.
  const lenses = [
    [
      "reviewer",
      "reviewer",
      `Review the branch's diff since ${since}; the surviving mutants: ${JSON.stringify(gate.survivors)}.`,
    ],
    ...(A.tier1 ? [["security-reviewer", "security", `Review the branch's diff since ${since} for security.`]] : []),
    ...(A.realm
      ? [["gnomcp:gno-auditor", "gno-auditor", `Audit every realm the branch changes, since ${since}.`]]
      : []),
  ];
  const reviews = await parallel(
    lenses.map(
      ([agentType, label, ask]) =>
        () =>
          agent(`${where(`${label}-${round}`)}. ${ask}`, { agentType, phase: "Review", label, schema: FINDINGS }),
    ),
  );
  const found = reviews.filter(Boolean).flatMap((r) => r.findings);

  phase("Verify");
  let kept = found;
  if (A.tier1 && found.length) {
    const checked = await agent(`${where(`verify-${round}`)}. Verify these findings: ${JSON.stringify(found)}.`, {
      agentType: "finding-verifier",
      label: "verifier",
      schema: VERDICTS,
    });
    const verdict = new Map((checked ? checked.verdicts : []).map((v) => [v.id, v]));
    kept = found
      .filter((f) => !verdict.has(f.id) || verdict.get(f.id).verdict !== "refuted")
      .map((f) => (verdict.has(f.id) ? { ...f, severity: verdict.get(f.id).severity } : f));
    log(`round ${round}: ${found.length} findings, ${found.length - kept.length} refuted`);
  }
  judged.push(...found);

  phase("Fix");
  const urgent = kept.filter((f) => f.severity !== "low" && !f.beyondPlan);
  low.push(...kept.filter((f) => f.severity === "low" || f.beyondPlan));
  if (!urgent.length) break;
  const fixed = await agent(
    `${where(`fix-${round}`)}. Fix these findings, each test first, its commit body naming it (\`Finding: <id>\`), after writing each to ` +
      `docs/review/findings.md with its status and evidence: ${JSON.stringify(urgent)}. No red pass of these tests: the gate and the mutation tester check them.`,
    { label: `fix round ${round}`, schema: DONE },
  );
  if (fixed) commits.push(...fixed.commits);
  // A second round only for a high finding fixed in tier-1 code (docs/REVIEW.md); otherwise one last merge check.
  if (!(A.tier1 && urgent.some((f) => f.severity === "high"))) {
    gate = await gateCheck();
    break;
  }
}
// The branch's cost, which docs/review-log.md compares with slice 4's; the chief stamps the hours, which a script cannot read.
const tokens = budget.spent();
log(
  `${A.branch}: ${round} rounds, ${commits.length} commits, ${low.length} low findings for Alexis, ${tokens} output tokens`,
);
return {
  branch: A.branch,
  status: gate && gate.passed ? "ready for the chief" : "blocked at the last merge check",
  rounds: round,
  tokens,
  gate,
  commits,
  low,
  judged,
};
