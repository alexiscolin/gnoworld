// promptfoo's provider for gnoworld's evals (ADR-0002 §5, "Evals"): jarvis's real entry, started as a child and switched
// on, with Anthropic's model and gnomcp for real, its universes' nodes a recorded node of the cases' own (jarvis.ts,
// fakes.ts). A case's raw answers and spans are kept in .cache/ by its request and a fingerprint of what jarvis and
// this provider run, and read again each time, so an unchanged case costs nothing; a failure is never kept. Run by
// run.sh with the key, on a developer's machine: never in an image, never in the gate.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { JARVIS_PATHS, JarvisAnswer, JarvisMadeDigest, JarvisTranslation } from "../packages/schemas/src/jarvis.ts";
import { Case, kindOf, type Kind } from "./cases.ts";
import { startFakes, type Fakes } from "./fakes.ts";
import { fingerprint } from "./fingerprint.ts";
import { startJarvis, type Started } from "./jarvis.ts";
import { outcomeOf } from "./spans.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const Universes = z.array(z.object({ id: z.string(), chainId: z.string(), rpc: z.url() }));
const universes = () => Universes.parse(JSON.parse(readFileSync(join(ROOT, "app/data/universes.json"), "utf8")));
const SCHEMAS = { ask: JarvisAnswer, translate: JarvisTranslation, digest: JarvisMadeDigest };

const Options = z.object({
  // jarvis's settings over the provider's, the models among them (promptfooconfig.yaml).
  config: z.record(z.string(), z.string()).default({}),
  // For the evals' own tests alone: more origins moved (a fake Anthropic), the cache's and the runs' folders, a gnomcp.
  outbound: z.record(z.string(), z.string()).default({}),
  cache: z.string().default(join(ROOT, "evals/.cache")),
  scratch: z.string().default(join(ROOT, "evals/.cache/runs")),
  gnomcp: z.string().optional(),
});
type Options = z.infer<typeof Options>;
const Answer = z.object({ status: z.number(), body: z.unknown() });
const Kept = z.object({ answers: z.array(Answer).min(1), batches: z.array(z.unknown()), ms: z.number() });
type Kept = z.infer<typeof Kept>;
interface Result {
  output: string;
  metadata: Record<string, unknown>;
  cost: number;
  latencyMs: number;
  cached?: true;
}

// What a case's run gave, read from its kept answers and spans: the grader's text, the checks' metadata, the cost.
function resultOf(kept: Kept): Result {
  const outcome = outcomeOf(kept.batches);
  const first = z.record(z.string(), z.unknown()).catch({}).parse(kept.answers[0]?.body);
  const digest = first["status"] === "digest" ? { digest: first["digest"], proposal: first["proposal"] } : first;
  const said = first["markdown"] ?? first["text"];
  const output = typeof said === "string" ? said : JSON.stringify(digest);
  const metadata = { ...outcome, status: first["status"], proposal: first["proposal"] ?? null, answers: kept.answers };
  return { output, metadata, cost: outcome.nanoUsd / 1e9, latencyMs: kept.ms };
}

// A run worth keeping: every answer jarvis's own, by its route's schema; a model's traced; spent only when asked so.
function keepable(one: Case, kind: Kind, kept: Kept): boolean {
  const schema = SCHEMAS[kind];
  const sound = kept.answers.every((answer) => answer.status === 200 && schema.safeParse(answer.body).success);
  if (!sound) return false;
  const statuses = kept.answers.map((answer) => z.object({ status: z.string() }).parse(answer.body).status);
  if (statuses.includes("off")) return false;
  if (statuses.includes("spent")) return one.spent === true;
  return outcomeOf(kept.batches).made >= 1;
}

// The request a case sends, alone, so a reworded rubric or expectation costs no run (10j's review, V8).
function requestOf(one: Case) {
  const kind = kindOf(one);
  const body = "ask" in one ? one.ask : "translate" in one ? one.translate : one.digest;
  const chain = "chain" in one ? one.chain : null;
  return { kind, body, chain, spent: one.spent === true, repeat: one.repeat ?? 1 };
}

export default class JarvisProvider {
  private readonly options: Options;
  private fakes: Promise<Fakes> | undefined;
  private readonly started = new Map<boolean, Promise<Started>>();

  constructor(options: unknown = {}) {
    this.options = Options.parse(options);
  }

  id(): string {
    return "gnoworld-jarvis";
  }

  async callApi(_prompt: string, context?: { vars?: Record<string, unknown> }): Promise<Result> {
    const one = Case.parse(JSON.parse(z.string().parse(context?.vars?.["case"])));
    const request = requestOf(one);
    const hash = createHash("sha256").update(fingerprint(ROOT, this.options.config));
    const file = join(this.options.cache, `${hash.update(JSON.stringify(request)).digest("hex")}.json`);
    if (existsSync(file)) return { ...resultOf(Kept.parse(JSON.parse(readFileSync(file, "utf8")))), cached: true };
    const kept = await this.run(one, request);
    if (keepable(one, request.kind, kept)) {
      mkdirSync(this.options.cache, { recursive: true });
      writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`);
    }
    return resultOf(kept);
  }

  // Every jarvis that started stopped and its folder gone, one that failed to start passed over, then the fakes.
  async cleanup(): Promise<void> {
    const started = await Promise.allSettled(this.started.values());
    this.started.clear();
    await Promise.all(started.flatMap((one) => (one.status === "fulfilled" ? [one.value.stop()] : [])));
    const fakes = await this.fakes;
    this.fakes = undefined;
    await fakes?.close();
  }

  private async startedFakes(): Promise<Fakes> {
    this.fakes ??= startFakes(universes());
    return this.fakes;
  }

  private async jarvis(spent: boolean): Promise<Started> {
    const { origin } = await this.startedFakes();
    const key = process.env["ANTHROPIC_API_KEY_FILE"];
    const gnomcp = this.options.gnomcp ?? process.env["GNOMCP"];
    if (key === undefined || gnomcp === undefined) throw new Error("evals: set ANTHROPIC_API_KEY_FILE and GNOMCP");
    const setup = { ...this.options, root: ROOT, fakes: origin, universes: universes(), spent, key, gnomcp };
    const known = this.started.get(spent) ?? startJarvis(setup);
    this.started.set(spent, known);
    return known;
  }

  private async run(one: Case, request: ReturnType<typeof requestOf>): Promise<Kept> {
    const jarvis = await this.jarvis(request.spent);
    const fakes = await this.startedFakes();
    if ("chain" in one) {
      fakes.realms.set(`${one.digest.universe} ${one.digest.realm}`, one.chain);
      fakes.at.height = one.chain.height;
    }
    const before = fakes.batches.length;
    const started = performance.now();
    const asked = async () => {
      const response = await fetch(`${jarvis.url}${JARVIS_PATHS[request.kind]}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      return { status: response.status, body: z.unknown().parse(await response.json()) };
    };
    const answers = await Promise.all(Array.from({ length: request.repeat }, asked));
    const ms = Math.round(performance.now() - started);
    await nextBatch(fakes, fakes.batches.length);
    return { answers, batches: fakes.batches.slice(before), ms };
  }
}

// The spans leave jarvis every 5 s, its whole queue at once (BatchSpanProcessor's default, which no setting moves):
// the first batch after the answers holds every span the case made; 7 s at most, a case with none (10j's review, V7).
async function nextBatch(fakes: Fakes, after: number): Promise<void> {
  for (let waited = 0; fakes.batches.length <= after && waited < 7_000; waited += 200)
    await new Promise((resolve) => setTimeout(resolve, 200));
}
