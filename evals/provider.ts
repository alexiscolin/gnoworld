// promptfoo's provider for gnoworld's evals (ADR-0002 §5, "Evals"): jarvis's real entry, started as a child and switched
// on, with Anthropic's model and gnomcp for real; the universes' nodes moved to a recorded node of the cases' own
// (jarvis/src/testing/outbound.ts), so a digest reads its page at a fixed height; its spans received here. An answer is
// kept in .cache/ by its case and a fingerprint of what jarvis runs, so an unchanged case costs nothing. Run by run.sh
// with the key, on a developer's machine: never in an image, never in the gate.
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { queryEnvelope, statusEnvelope } from "../packages/chain/src/testing/envelopes.ts";
import { JARVIS_PATHS } from "../packages/schemas/src/jarvis.ts";
import { seedSpent } from "./budget.ts";
import { Case, kindOf, type Chain } from "./cases.ts";
import { fingerprint } from "./fingerprint.ts";
import { outcomeOf } from "./spans.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const Universe = z.object({ id: z.string(), chainId: z.string(), rpc: z.url() });
const universes = () =>
  z.array(Universe).parse(JSON.parse(readFileSync(join(ROOT, "app/data/universes.json"), "utf8")));
const fromHex = (url: URL) => Buffer.from((url.searchParams.get("data") ?? "").replace(/^0x/, ""), "hex").toString();

/** The recorded node and the spans' receiver, on one loopback server: a realm by its universe and path. */
function startFakes() {
  const realms = new Map<string, Chain>();
  const batches: unknown[] = [];
  // The height the node's status names: the last realm's recorded, as one case runs at a time.
  const at = { height: 1 };
  const server = createServer((request, response) => {
    void answer(request, response);
  });
  async function answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://fake");
    const chunks: Buffer[] = [];
    for await (const chunk of request) if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    if (url.pathname === "/v1/traces") {
      batches.push(JSON.parse(Buffer.concat(chunks).toString()));
      response.writeHead(200, { "content-type": "application/json" }).end("{}");
      return;
    }
    const [, universe = "", route = ""] = /^\/node\/([a-z0-9-]+)\/(.*)$/.exec(url.pathname) ?? [];
    const chainId = universes().find((one) => one.id === universe)?.chainId;
    const held = (realm: string) => realms.get(`${universe} ${realm}`);
    const data = fromHex(url);
    const path = url.searchParams.get("path") ?? "";
    let body: unknown = queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } });
    if (route === "status") body = statusEnvelope(at.height, "2026-11-05T00:00:00Z", chainId);
    else if (path.includes("qrender") && held(data.replace(/:.*$/, "")) !== undefined)
      body = queryEnvelope({ data: held(data.replace(/:.*$/, ""))?.page ?? "" });
    else if (path.includes("qfuncs") && held(data) !== undefined)
      body = queryEnvelope({ data: JSON.stringify(held(data)?.functions) });
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  }
  return { server, realms, batches, at };
}

interface Jarvis {
  child: ChildProcess;
  url: string;
}
// jarvis's entry as the image starts it, with the test preload that moves the nodes; spent, its day's budgets used up.
async function startJarvis(fakes: string, spent: boolean, options: Options): Promise<Jarvis> {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-evals-"));
  const database = join(dir, "jarvis.db");
  if (spent) seedSpent(database);
  const nodes = universes().map((one) => [new URL(one.rpc).origin, `${fakes}/node/${one.id}`]);
  const routes = { ...Object.fromEntries(nodes), ...options.outbound };
  const key = process.env["ANTHROPIC_API_KEY_FILE"];
  const gnomcp = options.gnomcp ?? process.env["GNOMCP"];
  if (key === undefined || gnomcp === undefined) throw new Error("evals: set ANTHROPIC_API_KEY_FILE and GNOMCP");
  const ids = universes()
    .map((one) => one.id)
    .join(",");
  const env = {
    PATH: process.env["PATH"] ?? "",
    JARVIS: "on",
    JARVIS_HOST: "127.0.0.1",
    JARVIS_PORT: "0",
    JARVIS_DATABASE: database,
    JARVIS_BUDGET_USD: "1",
    JARVIS_TRANSLATION_BUDGET_USD: "1",
    ANTHROPIC_API_KEY_FILE: key,
    JARVIS_GNOMCP_COMMAND: gnomcp,
    JARVIS_GNOMCP_CONFIG: join(ROOT, "deploy/jarvis/gnomcp.toml"),
    JARVIS_PROFILES: ids,
    JARVIS_INDEXER_PROFILES: ids,
    JARVIS_TRACES_URL: `${fakes}/v1/traces`,
    JARVIS_TEST_OUTBOUND: JSON.stringify(routes),
    // gnomcp's folders, under a temporary folder of the run's own.
    TMPDIR: dir,
    ...options.config,
  };
  const flags = ["--disallow-code-generation-from-strings", "--import", join(ROOT, "jarvis/src/testing/outbound.ts")];
  const child = spawn(process.execPath, [...flags, join(ROOT, "jarvis/src/main.ts")], {
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  let out = "";
  const port = await new Promise<string>((resolve, reject) => {
    child.on("exit", (code) => reject(new Error(`evals: jarvis exited (${String(code)}) before it listened`)));
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const found = /"event":"listening".*"port":(\d+)/.exec(out)?.[1];
      if (found !== undefined) resolve(found);
    });
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

const Options = z.object({
  // jarvis's settings over the provider's, the models among them (promptfooconfig.yaml).
  config: z.record(z.string(), z.string()).default({}),
  // For the evals' own tests alone: more origins moved (a fake Anthropic), a cache folder, a gnomcp.
  outbound: z.record(z.string(), z.string()).default({}),
  cache: z.string().default(join(ROOT, "evals/.cache")),
  gnomcp: z.string().optional(),
});
type Options = z.infer<typeof Options>;
const Kept = z.object({
  output: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  cost: z.number(),
  ms: z.number(),
});
type Kept = z.infer<typeof Kept>;

export default class JarvisProvider {
  private readonly options: Options;
  private fakes: ReturnType<typeof startFakes> | undefined;
  private readonly started = new Map<boolean, Promise<Jarvis>>();
  private origin = "";

  constructor(options: unknown = {}) {
    this.options = Options.parse(options);
  }

  id(): string {
    return "gnoworld-jarvis";
  }

  async callApi(_prompt: string, context?: { vars?: Record<string, unknown> }): Promise<Record<string, unknown>> {
    const one = Case.parse(JSON.parse(z.string().parse(context?.vars?.["case"])));
    const settings = this.options.config;
    const key = createHash("sha256").update(fingerprint(ROOT, settings)).update(JSON.stringify(one)).digest("hex");
    const file = join(this.options.cache, `${key}.json`);
    if (existsSync(file)) {
      const kept = Kept.parse(JSON.parse(readFileSync(file, "utf8")));
      return { output: kept.output, metadata: kept.metadata, cost: kept.cost, latencyMs: kept.ms, cached: true };
    }
    const kept = await this.run(one);
    mkdirSync(this.options.cache, { recursive: true });
    writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`);
    return { output: kept.output, metadata: kept.metadata, cost: kept.cost, latencyMs: kept.ms };
  }

  // Every jarvis that started stopped, one that failed to start passed over, and the fakes closed whatever came before.
  async cleanup(): Promise<void> {
    for (const started of await Promise.allSettled(this.started.values()))
      if (started.status === "fulfilled") started.value.child.kill("SIGTERM");
    this.fakes?.server.close();
  }

  private async jarvis(spent: boolean): Promise<Jarvis> {
    if (this.fakes === undefined) {
      const fakes = startFakes();
      await new Promise<void>((resolve) => fakes.server.listen(0, "127.0.0.1", resolve));
      const address = fakes.server.address();
      this.origin = `http://127.0.0.1:${String(typeof address === "object" && address !== null ? address.port : 0)}`;
      this.fakes = fakes;
    }
    const known = this.started.get(spent) ?? startJarvis(this.origin, spent, this.options);
    this.started.set(spent, known);
    return known;
  }

  private async run(one: Case): Promise<Kept> {
    const jarvis = await this.jarvis(one.spent === true);
    const fakes = this.fakes;
    if (fakes === undefined) throw new Error("evals: the fakes did not start");
    if ("chain" in one) {
      fakes.realms.set(`${one.digest.universe} ${one.digest.realm}`, one.chain);
      fakes.at.height = one.chain.height;
    }
    const kind = kindOf(one);
    const body = "ask" in one ? one.ask : "translate" in one ? one.translate : one.digest;
    const before = fakes.batches.length;
    const started = performance.now();
    const answers = await Promise.all(
      Array.from({ length: one.repeat ?? 1 }, () =>
        fetch(`${jarvis.url}${JARVIS_PATHS[kind]}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).then(async (response) => z.record(z.string(), z.unknown()).parse(await response.json())),
      ),
    );
    const ms = Math.round(performance.now() - started);
    // The spans leave jarvis in batches every 5 s (BatchSpanProcessor's default): one batch past the answers.
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    const outcome = outcomeOf(fakes.batches.slice(before));
    const first = answers[0] ?? {};
    // What the grader reads: the answer's text, the translation, or the digest with its proposal.
    const digest = first["status"] === "digest" ? { digest: first["digest"], proposal: first["proposal"] } : first;
    const output =
      typeof first["markdown"] === "string"
        ? first["markdown"]
        : typeof first["text"] === "string"
          ? first["text"]
          : JSON.stringify(digest);
    const metadata = { ...outcome, status: first["status"], proposal: first["proposal"] ?? null, answers };
    return { output, metadata, cost: outcome.nanoUsd / 1e9, ms };
  }
}
