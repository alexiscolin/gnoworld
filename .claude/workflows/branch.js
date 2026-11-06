export const meta = {
  name: "branch",
  description:
    "One branch of a slice, from its failing tests to a reviewed merge check: tests, red pass, code, merge check, one combined review, high and medium fixes",
  whenToUse:
    'A branch session runs it once its worktree and brief exist (docs/HARNESS.md, "Who does what"); the chief reads what it returns.',
  phases: [
    { title: "Tests", detail: "the failing tests, seen failing" },
    { title: "Red pass", detail: "the test-auditor, once per branch, for tier-1 and harness tests alone" },
    { title: "Build", detail: "the red pass's findings, then the code, a commit per behaviour" },
    { title: "Merge check", detail: "check.sh --merge, the failing lane alone until it passes" },
    {
      title: "Review",
      detail:
        "the reviewer, screens read with the video's frames; the security-reviewer for tier 1 or the harness; the gno-auditor for a realm; the design-reviewer for space's look",
    },
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
// The design-reviewer's answer: findings like the others', and whether the video's frames were missing (which fails the step).
const DESIGN = {
  ...FINDINGS,
  properties: { ...FINDINGS.properties, framesMissing: { type: "boolean" } },
  required: ["findings", "framesMissing"],
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
    // What the fixer could not reproduce, with its evidence: a claim, which stands only once a finding-verifier refutes the finding (F5542).
    rejected: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, evidence: { type: "string" } },
        required: ["id", "evidence"],
      },
    },
    notes: { type: "string" },
    branch: BRANCH,
  },
  required: ["fixed", "notes", "branch"],
};
const VERDICTS = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, refuted: { type: "boolean" }, evidence: { type: "string" } },
        required: ["id", "refuted", "evidence"],
      },
    },
  },
  required: ["verdicts"],
};
const GATE = {
  type: "object",
  properties: {
    passed: { type: "boolean" },
    failingLane: { type: "string" },
    tail: { type: "string" },
    lastLine: { type: "string" },
    exit: { type: "number" },
    survivors: { type: "array", items: { type: "string" } },
    files: { type: "array", items: { type: "string" } },
    relaxations: { type: "array", items: { type: "string" } },
    seconds: { type: "number" },
    branch: BRANCH,
  },
  required: [
    "passed",
    "failingLane",
    "tail",
    "lastLine",
    "exit",
    "survivors",
    "files",
    "relaxations",
    "seconds",
    "branch",
  ],
};
const commits = [];
const low = [];
const rejections = []; // the findings a fixer rejected and a finding-verifier refuted: the chief reads each with both evidences (F5542)
const judged = [];
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
  "app/src/cspOrigins.ts",
  "app/src/cspForms.ts",
  "app/src/lib/chain/evalCall.ts",
  "deploy/",
  "packages/core/src/markdown/",
  "packages/core/src/args/",
  "app/src/lib/adena/",
  "server/src/login/",
  "app/src/features/login/",
  "app/src/lib/api/login.ts",
  "app/src/lib/ergo/",
  "server/src/roles/",
  "server/roles.json",
  "app/src/sw/",
  "packages/core/src/chain/",
  "server/src/guard.ts",
  "server/src/limit.ts",
  "server/src/config.ts",
  "packages/service/src/net.ts",
  "packages/service/src/settings.ts",
  "app/src/features/chat/embeds.ts",
  "app/src/features/chat/Embed.tsx",
  "app/src/features/realms/useExternalLinks.tsx",
  "app/src/leaving.tsx",
  "app/src/pagePath.ts",
  "jarvis/src/",
  ...(A.tier1 || []),
];
const BASE = A.base || "main";
const tier1 = (file) => TIER1.some((prefix) => file === prefix || file.startsWith(prefix));
const realm = (file) => file.startsWith("gno/r/") || file.startsWith("gno/p/");
// A screen: the app's own source and the design system's (Alexis, 2026-10-31), which the reviewer compares with the video's frames; how
// space looks (the scene, the planets, the cosmos) brings the design-reviewer apart (Alexis, 2026-11-04: one combined review).
const screen = (file) => file.startsWith("app/src/") || file.startsWith("packages/ui/src/");
const space = (file) =>
  ["app/src/scene/", "packages/core/src/planet/", "packages/core/src/cosmos/", "packages/core/src/space/"].some((p) =>
    file.startsWith(p),
  );
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
  rejected: rejections,
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

// A merge check passed only when check.sh printed its pass line as the last line of its output. The agent's word is not the proof (reviewer-1-2,
// F2617: a run killed before its probe lane was declared PASSED): the script reads `lastLine` itself, and a run killed, timed out or left in
// the background has none.
const PASS_LINE = /^all checks passed in \d+ s/;
const proven = (g) => {
  if (!g || !g.passed || (g.exit === 0 && PASS_LINE.test(g.lastLine || ""))) return g;
  return {
    ...g,
    passed: false,
    failingLane: g.failingLane || "unproven",
    tail:
      g.exit === 0
        ? `the agent said passed, but the last line of check.sh's output was '${g.lastLine || ""}', not 'all checks passed in N s': a run killed, timed out or left in the background is no pass. Run it again to its end.\n${g.tail || ""}`
        : `the agent said passed, but check.sh's exit code was ${g.exit === undefined ? "not reported" : g.exit}, not 0 (its last line: '${g.lastLine || ""}'): only an exit code of 0 is a pass. Run it again to its end.\n${g.tail || ""}`,
  };
};
const gateCheck = async () =>
  proven(
    await write(
      `${where("merge-check", true)}. Run \`sh scripts/check.sh --merge${BASE === "main" ? "" : ` --base ${BASE}`}\` (minutes) and time it. Wait for it to end: a run killed, timed out or left in the background is not a pass. Report whether it passed, the failing lane, the ` +
        "tail of its output, `lastLine`, the literal last line of its output (a pass is the line `all checks passed in N s`; a failure ends on `check.sh: FAILED at <lane>:<step>`; anything else is a failure whatever you think, and the script reads this line itself), `exit`, check.sh's exit code, read with `echo $?` right after it ended (run it with its output to a file, never into a pipe, whose exit code is another's; anything but 0 is a failure), the surviving mutants it printed, pass or fail (every line that starts with `survivor: `, StrykerJS's and harness_mutate's: " +
        `copy each whole, one string each, and the line \`survivors not listed: \` if it prints one: the survivors of files this branch did not change), the files changed since ${BASE} as \`git diff --name-only ${BASE}...HEAD\` prints them (nothing else: not the files you write), and every line of ` +
        `\`git log ${BASE}..HEAD\` that loosens the net (\`Removed-test:\`, \`Lowered-floor:\`, \`Updated-baseline:\`, \`Batch-size:\`, \`No-test:\`), which ` +
        `the chief and Alexis read. Write the diff since ${BASE} ` +
        "to .claude/tmp/diff.patch. Read .claude/tmp/unsteady.log: give each file named a ledger row (docs/review/findings.md) and a line in the " +
        `learnings, delete the log, and commit the rows (\`docs(review): unsteady ...\`), numbered within ${A.ids}. Change no code.`,
      // An agent that runs a command and waits for it: the cheaper model, little reasoning.
      { phase: "Merge check", label: "merge check", schema: GATE, model: "sonnet", effort: "low" },
    ),
  );

phase("Tests");
const tests = await agent(
  `${where("tests", true)}. Write the failing tests the brief calls for, test first (CLAUDE.md), and run them: each must fail for the reason ` +
    "it names. Write no product code and commit nothing.",
  { label: "tests", schema: TESTS },
);
if (!tests || !tests.seenFailing) return result("blocked at the tests", { tests });

phase("Red pass");
// The red pass is for tier-1 and harness code alone (the speed plan, 2026-11-06): tests of other code go to the build as they are.
const red = tests.files.some(tier1)
  ? await agent(`Red pass. ${where("red-pass", false)}. The failing tests, uncommitted: ${tests.files.join(", ")}.`, {
      agentType: "test-auditor",
      label: "red pass",
      schema: FINDINGS,
    })
  : { findings: [] };
if (!red) return result("blocked at the red pass: the test-auditor gave no report");

phase("Build");
const built = await write(
  `${where("build", true)}. Save the red pass's findings to ${A.shared}/reports/${A.branch}-red-pass.md, then fix them in the tests: ` +
    `${JSON.stringify(red.findings)}. Then write the code until they pass. Commit each behaviour with its tests (the fast gate runs at each ` +
    "commit: a refused commit is fixed, never bypassed). No declaration line is needed in a message by default.",
  { label: "build", schema: DONE },
);
if (!built) return result("blocked at the build");
commits.push(...built.commits);

let gate = null;
let since = BASE;
let ruledOut = ""; // the last round's rejections that stood, said to the lenses of the next: confirm, or dispute with new evidence
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
      `Review the branch's diff since ${since} (.claude/tmp/diff.patch holds the diff since ${BASE}); the surviving mutants: ${JSON.stringify(gate.survivors)}.` +
        (gate.files.some(screen) && !gate.files.some(space)
          ? " Compare every screen it changes with the video's frames, by the steps of .claude/agents/design-reviewer.md, in this same pass."
          : ""),
    ],
    ...(touchesTier1
      ? [["security-reviewer", "security", `Review the branch's diff since ${since} for security.`]]
      : []),
    ...(gate.files.some(realm)
      ? [["gnomcp:gno-auditor", "gno-auditor", `Audit every realm the branch changes, since ${since}.`]]
      : []),
    ...(gate.files.some(space)
      ? [
          [
            "design-reviewer",
            "design-reviewer",
            `Compare every screen the branch changes since ${since} (.claude/tmp/diff.patch holds the diff since ${BASE}) with the video's frames: ` +
              "render each at 1728 by 1080, open the frames docs/design/video-screens.md gives for it in ~/.cache/gnoworld-tools/video-frames/, " +
              "and report each difference as a finding naming both pictures. Frames missing: set framesMissing, the step fails.",
          ],
        ]
      : []),
  ].filter(([, label]) => !lensesDue || lensesDue.has(label));
  const ask = ([agentType, label, question]) =>
    agent(`${where(`${label}-${round}`, false)}. ${question}${ruledOut}`, {
      agentType,
      phase: "Review",
      label,
      schema: label === "design-reviewer" ? DESIGN : FINDINGS,
    });
  // Four agents at most at once on the machine (CLAUDE.md): with two branches in review, three lenses run one after another.
  const reviews =
    lenses.length > 2
      ? await lenses.reduce(async (done, lens) => [...(await done), await ask(lens)], Promise.resolve([]))
      : await parallel(lenses.map((lens) => () => ask(lens)));
  if (!reviews.every(Boolean)) return result(`blocked at review round ${round}: a lens gave no report`, { gate });
  // Frames missing fail the step, never skip it: a comparison nobody made is not a clean review.
  if (reviews.some((r, i) => lenses[i][1] === "design-reviewer" && r.framesMissing))
    return result(`blocked at review round ${round}: the design-reviewer found the video's frames missing`, { gate });
  // Numbered here, by lens and order: each lens counts from 1, and an id names one finding alone.
  const found = reviews.flatMap((r, i) =>
    r.findings.map((f, n) => ({ ...f, id: `${lenses[i][1]}-${round}-${n + 1}`, lens: lenses[i][1] })),
  );

  const kept = found;
  judged.push(...found);

  phase("Fix");
  const urgent = kept.filter((f) => f.severity !== "low" && !f.beyondPlan);
  low.push(...kept.filter((f) => f.severity === "low" || f.beyondPlan));
  // The scribe: every finding of the round to the ledger with its status and evidence, the round's reports saved; the reviewers wrote
  // nothing themselves.
  const scribed = await write(
    `${where(`ledger-${round}`, true)}. Write each of these findings as a row of docs/review/findings.md, with the next free F number: ` +
      `the urgent ones \`claimed\` (their fixer marks each \`reproduced\` once its test fails, or \`rejected\` with its evidence), the low ones and those beyond the plan \`asked\`. ` +
      `Number them within this branch's range, ${A.ids}, never past it. ` +
      `Findings: ${JSON.stringify(found)}. Urgent: ${JSON.stringify(urgent.map((f) => f.id))}. ` +
      `Save them as ${A.shared}/reports/${A.branch}-review-${round}.md. Commit the ledger (\`docs(review): ${A.branch}'s round ${round}\`).`,
    { phase: "Fix", label: `ledger ${round}`, schema: DONE, model: "sonnet", effort: "low" },
  );
  if (!scribed) return result(`blocked at the ledger of round ${round}`, { gate });
  commits.push(...scribed.commits);
  if (!urgent.length) break;

  const fixed = await write(
    `${where(`fix-${round}`, true)}. Fix these findings, each test first, its commit body naming its ledger row (\`Finding: F<n>\`), and mark the ` +
      `row fixed with its commit: ${JSON.stringify(urgent)}. No red pass of these tests: the gate and the mutation tester check them. ` +
      "Return each finding's id with the commit that fixes it; one you cannot reproduce, a command or a test, mark `rejected` with your " +
      "evidence and return it under `rejected`: a finding-verifier then checks that claim, and a rejection it does not refute stays open.",
    { label: `fix round ${round}`, schema: FIXED },
  );
  // A rejection is the fixer's word alone: it stands only when a fresh finding-verifier refutes the finding with evidence of its own (decision
  // 684 left the verifier out for a reviewer's repro, never for a fixer's "could not reproduce", F5542). No report, or no refutation: open.
  const claimed = fixed && fixed.rejected ? fixed.rejected.filter((f) => urgent.some((u) => u.id === f.id)) : [];
  const ruling = claimed.length
    ? await agent(
        `${where(`verify-${round}`, false)}. The fixer says it cannot reproduce these findings: ${JSON.stringify(claimed)}. The findings as the review raised ` +
          `them: ${JSON.stringify(urgent.filter((f) => claimed.some((c) => c.id === f.id)))}. Reproduce each, or refute it with evidence of your own (a command ` +
          "and its output, a file:line, never the fixer's word). `refuted` is true only for a finding you refuted. One verdict per finding.",
        { agentType: "finding-verifier", phase: "Fix", label: `verify rejected ${round}`, schema: VERDICTS },
      )
    : null;
  const verdictOf = (id) => (ruling ? ruling.verdicts.find((v) => v.refuted && v.id === id) : undefined);
  const rejectedIds = new Set(claimed.filter((f) => verdictOf(f.id)).map((f) => f.id));
  for (const f of claimed.filter((c) => rejectedIds.has(c.id))) {
    const raised = urgent.find((u) => u.id === f.id);
    rejections.push({
      id: f.id,
      severity: raised.severity,
      file: raised.file,
      fixer: f.evidence,
      verifier: verdictOf(f.id).evidence,
    });
  }
  ruledOut = rejectedIds.size
    ? ` The last round's fixer rejected these findings and a finding-verifier refuted them: ${JSON.stringify(rejections.filter((r) => rejectedIds.has(r.id)))}. Confirm each, or dispute it with new evidence of your own.`
    : "";
  const fixedIds = new Set(fixed ? fixed.fixed.map((f) => f.id) : []);
  const open = urgent.filter((f) => !fixedIds.has(f.id) && !rejectedIds.has(f.id));
  if (open.length)
    return result(`blocked at the fixes of round ${round}: ${open.map((f) => f.id).join(", ")} still open`, {
      gate,
      open,
    });
  commits.push(...fixed.fixed.map((f) => f.commit));
  // A second round only for a high finding fixed in a tier-1 file, and only its lens, on the diff since its first fix
  // (docs/REVIEW.md); otherwise one last merge check.
  // A rejection that stood is no end of it: a high finding on tier 1 gets its second round, its lens told (F5542).
  const highOnTier1 = urgent.filter((f) => f.severity === "high" && tier1(f.file));
  if (!highOnTier1.length) {
    gate = await gateCheck();
    break;
  }
  lensesDue = new Set(highOnTier1.map((f) => f.lens));
  const first = highOnTier1.map((f) => fixed.fixed.find((x) => x.id === f.id)).find(Boolean); // none when all were rejected: the same diff again
  if (first) since = `${first.commit}^`;
}
log(
  `${A.branch}: ${commits.length} commits, ${low.length} low findings for Alexis, ${budget.spent() - start} output tokens`,
);
return result(gate && gate.passed ? "ready for the chief" : "blocked at the last merge check", {
  gate,
  relaxations: gate ? gate.relaxations : [],
});
