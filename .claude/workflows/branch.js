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
    { title: "Verify", detail: "the finding-verifier on findings in tier-1 files" },
    {
      title: "Fix",
      detail: "every finding to the ledger; high and medium fixed, test first; low ones listed for Alexis",
    },
  ],
};

// args: { branch, worktree, plan, brief, shared, ids, base, tier1 }: base, the branch the work is cut from and reviewed against (main when absent: an integration branch for part 2 of a slice); ids, the F numbers the chief gives the branch; shared, the slice's folder the chief makes (.claude/tmp/slice-<n>);
// tier1, path prefixes of tier-1 files (docs/REVIEW.md) added to the harness's and the realms', which no argument can
// leave out (security review of slice-5-loop, 2).
const A = args;
const start = budget.spent();
const SEVERITY = { type: "string", enum: ["high", "medium", "low"] };
const FINDINGS = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: SEVERITY,
          file: { type: "string" },
          scenario: { type: "string" },
          evidence: { type: "string" },
          fix: { type: "string" },
          beyondPlan: { type: "boolean" },
        },
        required: ["severity", "file", "scenario", "evidence", "fix", "beyondPlan"],
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
const BRANCH = { type: "string", description: "`git -C <worktree> rev-parse --abbrev-ref HEAD` after your commits" };
const DONE = {
  type: "object",
  properties: { commits: { type: "array", items: { type: "string" } }, notes: { type: "string" }, branch: BRANCH },
  required: ["commits", "notes", "branch"],
};
const FIXED = {
  type: "object",
  properties: {
    fixed: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, commit: { type: "string" } },
        required: ["id", "commit"],
      },
    },
    notes: { type: "string" },
    branch: BRANCH,
  },
  required: ["fixed", "notes", "branch"],
};
const GATE = {
  type: "object",
  properties: {
    passed: { type: "boolean" },
    failingLane: { type: "string" },
    tail: { type: "string" },
    survivors: { type: "array", items: { type: "string" } },
    files: { type: "array", items: { type: "string" } },
    relaxations: { type: "array", items: { type: "string" } },
    seconds: { type: "number" },
    branch: BRANCH,
  },
  required: ["passed", "failingLane", "tail", "survivors", "files", "relaxations", "seconds", "branch"],
};
// The verifier answers for the ids it is given, and only those.
const verdictsFor = (ids) => ({
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: ids },
          verdict: { type: "string", enum: ["reproduced", "refuted", "unverified"] },
          severity: SEVERITY,
          evidence: { type: "string" },
        },
        required: ["id", "verdict", "severity", "evidence"],
      },
    },
  },
  required: ["verdicts"],
});

const commits = [];
const low = [];
const judged = [];
const verdicts = [];
// The tier-1 paths of docs/REVIEW.md's table that exist: the harness, the realms, the relay's auth script, the CSP, the deploy folder, the markdown
// scanner, Adena, the login (server and client), the admin API's rights, the worker. A check in scripts/test_hooks.sh (workflow_branch) fails when the
// table names in backticks a path this list lacks, or this list holds one the table does not name.
const TIER1 = [
  "scripts/",
  ".githooks/",
  ".github/",
  ".claude/",
  "gno/",
  "server/src/ergo/",
  "app/src/csp.ts",
  "deploy/",
  "packages/core/src/markdown/",
  "app/src/lib/adena/",
  "server/src/login/",
  "app/src/features/login/",
  "app/src/lib/api/login.ts",
  "app/src/lib/ergo/",
  "server/src/roles/",
  "server/roles.json",
  "app/src/sw/",
  ...(A.tier1 || []),
];
const BASE = A.base || "main";
const tier1 = (file) => TIER1.some((prefix) => file === prefix || file.startsWith(prefix));
const realm = (file) => file.startsWith("gno/r/") || file.startsWith("gno/p/");
// A writer that committed on another branch than its own (slice-5a's commit on main) counts as no report, and the loop
// stops there, its status naming the branch; so does a list of files holding the agent's own rather than git's.
const strays = [];
const write = async (prompt, opts) => {
  const done = await agent(prompt, opts);
  if (done && done.branch !== A.branch) strays.push(done.branch);
  return done && done.branch === A.branch ? done : null;
};
const notGits = (files) => files.some((f) => f.startsWith("/") || f.startsWith(".claude/tmp/"));
const result = (status, extra) => ({
  branch: A.branch,
  status: strays.length ? `${status} (committed on ${strays.join(", ")}, not ${A.branch})` : status,
  outputTokens: budget.spent() - start,
  commits,
  low,
  judged,
  verdicts,
  ...extra,
});

// What every agent of the loop is told: where it works and what it reads. One that writes also leaves its trace in the slice's
// shared files; a reviewer, which never writes, has its report saved by the scribe.
const where = (step, writes) =>
  `Branch ${A.branch}, worktree ${A.worktree}: work there alone. The shell goes back to the main checkout after every call, so ` +
  `every Bash command begins with \`cd "${A.worktree}" || exit 1\` and the rest of it in the same call. ` +
  `The slice plan: ${A.plan}. This branch's brief: ${A.brief}. Your step: ${step}. ` +
  "rtk swallows git's output written to a file: write a diff to a file through python3's subprocess. " +
  (writes
    ? `When you learn something a later branch should know (a flaky test, a wrong assumption, a tool's trap), append one dated line to ${A.shared}/learnings.md. ` +
      `When you finish, append one line to ${A.shared}/${A.branch}.state.md (the step, what it did, its commits) and save your report to ${A.shared}/reports/${A.branch}-${step}.md.`
    : "You are read-only: report, write nothing.");

const gateCheck = () =>
  write(
    `${where("merge-check", true)}. Run \`sh scripts/check.sh --merge${BASE === "main" ? "" : ` --base ${BASE}`}\` (minutes) and time it. Report whether it passed, the failing lane and the ` +
      "tail of its output, the surviving mutants it printed, pass or fail (every line that starts with `survivor: `, StrykerJS's and harness_mutate's: " +
      `copy each whole, one string each, and the line \`survivors not listed: \` if it prints one: the survivors of files this branch did not change), the files changed since ${BASE} as \`git diff --name-only ${BASE}...HEAD\` prints them (nothing else: not the files you write), and every line of ` +
      `\`git log ${BASE}..HEAD\` that loosens the net (\`Removed-test:\`, \`Lowered-floor:\`, \`Updated-baseline:\`, \`Batch-size:\`, \`No-test:\`), which ` +
      `the chief and Alexis read. Write the diff since ${BASE} ` +
      "to .claude/tmp/diff.patch. Read .claude/tmp/unsteady.log: give each file named a ledger row (docs/review/findings.md) and a line in the " +
      `learnings, delete the log, and commit the rows (\`docs(review): unsteady ...\`), numbered within ${A.ids}. Change no code.`,
    // An agent that runs a command and waits for it: the cheaper model, little reasoning.
    { phase: "Merge check", label: "merge check", schema: GATE, model: "sonnet", effort: "low" },
  );

phase("Tests");
const tests = await agent(
  `${where("tests", true)}. Write the failing tests the brief calls for, test first (CLAUDE.md), and run them: each must fail for the reason ` +
    "it names. Write no product code and commit nothing.",
  { label: "tests", schema: TESTS },
);
if (!tests || !tests.seenFailing) return result("blocked at the tests", { tests });

phase("Red pass");
const red = await agent(
  `Red pass. ${where("red-pass", false)}. The failing tests, uncommitted: ${tests.files.join(", ")}.`,
  {
    agentType: "test-auditor",
    label: "red pass",
    schema: FINDINGS,
  },
);
if (!red) return result("blocked at the red pass: the test-auditor gave no report");

phase("Build");
const built = await write(
  `${where("build", true)}. Save the red pass's findings to ${A.shared}/reports/${A.branch}-red-pass.md, then fix them in the tests: ` +
    `${JSON.stringify(red.findings)}. Then write the code until they pass. Commit each behaviour with its tests (the fast gate runs at each ` +
    "commit: a refused commit is fixed, never bypassed); the commit that brings the tests says `Red-pass: <the findings fixed>`.",
  { label: "build", schema: DONE },
);
if (!built) return result("blocked at the build");
commits.push(...built.commits);

let gate = null;
let since = BASE;
let lensesDue = null; // all lenses in round 1; afterwards only those whose high findings in tier-1 files were fixed
for (let round = 1; ; round += 1) {
  gate = await gateCheck();
  for (let tries = 0; gate && !gate.passed && tries < 2; tries += 1) {
    const fixed = await write(
      `${where("gate-fix", true)}. The merge check failed in its ${gate.failingLane} lane:\n${gate.tail}\n` +
        "Run that lane's commands alone, find the cause and fix it, test first for a bug of the product. A test that fails once and passes alone " +
        "is a flaky one: a ledger row and a learnings line, not a retry. Never change a test to make code pass without saying so in its commit. Commit.",
      { phase: "Merge check", label: `gate fix ${tries + 1}`, schema: DONE },
    );
    if (!fixed) return result("blocked at the merge check: its fixer gave no report", { gate });
    commits.push(...fixed.commits);
    gate = await gateCheck();
  }
  if (!gate || !gate.passed) return result("blocked at the merge check", { gate });
  if (notGits(gate.files))
    return result("blocked at the merge check: its files are not git's (.claude/tmp or an absolute path)", { gate });
  if (round === 4)
    return result("reconsider with Alexis: a high tier-1 finding came back three rounds running", { gate, rounds: 3 });

  phase("Review");
  const touchesTier1 = gate.files.some(tier1);
  // [agent type, label, what it is asked]
  const lenses = [
    [
      "reviewer",
      "reviewer",
      `Review the branch's diff since ${since} (.claude/tmp/diff.patch holds the diff since ${BASE}); the surviving mutants: ${JSON.stringify(gate.survivors)}.`,
    ],
    ...(touchesTier1
      ? [["security-reviewer", "security", `Review the branch's diff since ${since} for security.`]]
      : []),
    ...(gate.files.some(realm)
      ? [["gnomcp:gno-auditor", "gno-auditor", `Audit every realm the branch changes, since ${since}.`]]
      : []),
  ].filter(([, label]) => !lensesDue || lensesDue.has(label));
  const ask = ([agentType, label, question]) =>
    agent(`${where(`${label}-${round}`, false)}. ${question}`, { agentType, phase: "Review", label, schema: FINDINGS });
  // Four agents at most at once on the machine (CLAUDE.md): with two branches in review, three lenses run one after another.
  const reviews =
    lenses.length > 2
      ? await lenses.reduce(async (done, lens) => [...(await done), await ask(lens)], Promise.resolve([]))
      : await parallel(lenses.map((lens) => () => ask(lens)));
  if (!reviews.every(Boolean)) return result(`blocked at review round ${round}: a lens gave no report`, { gate });
  // Numbered here, by lens and order: each lens counts from 1, and a verdict must name one finding alone.
  const found = reviews.flatMap((r, i) =>
    r.findings.map((f, n) => ({ ...f, id: `${lenses[i][1]}-${round}-${n + 1}`, lens: lenses[i][1] })),
  );

  phase("Verify");
  let kept = found;
  const onTier1 = found.filter((f) => tier1(f.file));
  if (onTier1.length) {
    const checked = await agent(
      `${where(`verify-${round}`, false)}. Verify these findings: ${JSON.stringify(onTier1)}.`,
      {
        agentType: "finding-verifier",
        label: "verifier",
        schema: verdictsFor(onTier1.map((f) => f.id)),
      },
    );
    if (!checked) return result(`blocked at verification round ${round}: the verifier gave no report`, { gate });
    verdicts.push(...checked.verdicts);
    const verdict = new Map(checked.verdicts.map((v) => [v.id, v]));
    kept = found
      .filter((f) => !verdict.has(f.id) || verdict.get(f.id).verdict !== "refuted")
      .map((f) => (verdict.has(f.id) ? { ...f, severity: verdict.get(f.id).severity } : f));
    log(`round ${round}: ${found.length} findings, ${found.length - kept.length} refuted`);
  }
  judged.push(...found);

  phase("Fix");
  const urgent = kept.filter((f) => f.severity !== "low" && !f.beyondPlan);
  low.push(...kept.filter((f) => f.severity === "low" || f.beyondPlan));
  // The scribe: every finding of the round to the ledger with its status and evidence (a refuted one rejected with the
  // verifier's), the round's reports saved; the reviewers wrote nothing themselves.
  const scribed = await write(
    `${where(`ledger-${round}`, true)}. Write each of these findings as a row of docs/review/findings.md, with the next free F number: ` +
      `the urgent ones \`reproduced\`, the low ones and those beyond the plan \`asked\`, a refuted one \`rejected\` with the verifier's evidence. ` +
      `Number them within this branch's range, ${A.ids}, never past it. ` +
      `Findings: ${JSON.stringify(found)}. Urgent: ${JSON.stringify(urgent.map((f) => f.id))}. Verdicts: ${JSON.stringify(verdicts)}. ` +
      `Save them as ${A.shared}/reports/${A.branch}-review-${round}.md. Commit the ledger (\`docs(review): ${A.branch}'s round ${round}\`).`,
    { phase: "Fix", label: `ledger ${round}`, schema: DONE, model: "sonnet", effort: "low" },
  );
  if (!scribed) return result(`blocked at the ledger of round ${round}`, { gate });
  commits.push(...scribed.commits);
  if (!urgent.length) break;

  const fixed = await write(
    `${where(`fix-${round}`, true)}. Fix these findings, each test first, its commit body naming its ledger row (\`Finding: F<n>\`), and mark the ` +
      `row fixed with its commit: ${JSON.stringify(urgent)}. No red pass of these tests: the gate and the mutation tester check them. ` +
      "Return each finding's id with the commit that fixes it.",
    { label: `fix round ${round}`, schema: FIXED },
  );
  const fixedIds = new Set(fixed ? fixed.fixed.map((f) => f.id) : []);
  const open = urgent.filter((f) => !fixedIds.has(f.id));
  if (open.length)
    return result(`blocked at the fixes of round ${round}: ${open.map((f) => f.id).join(", ")} still open`, {
      gate,
      open,
    });
  commits.push(...fixed.fixed.map((f) => f.commit));
  // A second round only for a high finding fixed in a tier-1 file, and only its lens, on the diff since its first fix
  // (docs/REVIEW.md); otherwise one last merge check.
  const highOnTier1 = urgent.filter((f) => f.severity === "high" && tier1(f.file));
  if (!highOnTier1.length) {
    gate = await gateCheck();
    break;
  }
  lensesDue = new Set(highOnTier1.map((f) => f.lens));
  since = `${fixed.fixed.find((f) => f.id === highOnTier1[0].id).commit}^`;
}
log(
  `${A.branch}: ${commits.length} commits, ${low.length} low findings for Alexis, ${budget.spent() - start} output tokens`,
);
return result(gate && gate.passed ? "ready for the chief" : "blocked at the last merge check", {
  gate,
  relaxations: gate ? gate.relaxations : [],
});
