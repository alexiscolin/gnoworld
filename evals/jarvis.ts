// jarvis's real entry for an eval run (provider.ts), started as the image starts it, switched on, with the test
// preload that moves the universes' nodes to the run's recorded node (jarvis/src/testing/outbound.ts); on a spent
// day's file, its budgets used up. Its stop waits for it to exit, then removes its folder (10j's review, V6).
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { seedSpent } from "./budget.ts";

export interface Started {
  url: string;
  stop: () => Promise<void>;
}
export interface Setup {
  root: string;
  // The run's recorded node and spans' receiver, and the universes it records.
  fakes: string;
  universes: readonly { id: string; rpc: string }[];
  spent: boolean;
  key: string;
  gnomcp: string;
  // Where the run's folders go, and jarvis's settings over these.
  scratch: string;
  config: Readonly<Record<string, string>>;
  outbound: Readonly<Record<string, string>>;
}

// A stop's longest wait before the child is killed: its drain (1 s here) and gnomcp's close.
const STOP_MS = 10_000;

export async function startJarvis(setup: Setup): Promise<Started> {
  mkdirSync(setup.scratch, { recursive: true });
  const dir = mkdtempSync(join(setup.scratch, "jarvis-"));
  const database = join(dir, "jarvis.db");
  if (setup.spent) seedSpent(database);
  const nodes = setup.universes.map((one) => [new URL(one.rpc).origin, `${setup.fakes}/node/${one.id}`]);
  const ids = setup.universes.map((one) => one.id).join(",");
  const env = {
    PATH: process.env["PATH"] ?? "",
    JARVIS: "on",
    JARVIS_HOST: "127.0.0.1",
    JARVIS_PORT: "0",
    JARVIS_DATABASE: database,
    // A run's budgets, past what the suite spends (about $2), so no case meets the cap but the spent ones.
    JARVIS_BUDGET_USD: "20",
    JARVIS_TRANSLATION_BUDGET_USD: "5",
    JARVIS_DRAIN_S: "1",
    ANTHROPIC_API_KEY_FILE: setup.key,
    JARVIS_GNOMCP_COMMAND: setup.gnomcp,
    JARVIS_GNOMCP_CONFIG: join(setup.root, "deploy/jarvis/gnomcp.toml"),
    JARVIS_PROFILES: ids,
    JARVIS_INDEXER_PROFILES: ids,
    JARVIS_TRACES_URL: `${setup.fakes}/v1/traces`,
    JARVIS_TEST_OUTBOUND: JSON.stringify({ ...Object.fromEntries(nodes), ...setup.outbound }),
    // gnomcp's folders, in the run's own.
    TMPDIR: dir,
    ...setup.config,
  };
  const flags = [
    "--disallow-code-generation-from-strings",
    "--import",
    join(setup.root, "jarvis/src/testing/outbound.ts"),
  ];
  const child = spawn(process.execPath, [...flags, join(setup.root, "jarvis/src/main.ts")], {
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = once(child, "exit").then(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const port = await listening(child.stdout, exited);
  const stop = async (): Promise<void> => {
    child.kill("SIGTERM");
    const killed = setTimeout(() => child.kill("SIGKILL"), STOP_MS);
    await exited;
    clearTimeout(killed);
  };
  return { url: `http://127.0.0.1:${port}`, stop };
}

// The port jarvis says it listens on; its output read no further once it is said.
async function listening(stdout: NodeJS.ReadableStream, exited: Promise<void>): Promise<string> {
  let out = "";
  const said = new Promise<string>((resolve) => {
    const read = (chunk: Buffer) => {
      out += chunk.toString();
      const port = /"event":"listening".*"port":(\d+)/.exec(out)?.[1];
      if (port === undefined) return;
      stdout.off("data", read);
      stdout.resume();
      resolve(port);
    };
    stdout.on("data", read);
  });
  // A sentinel, not a rejection: an exit after jarvis listened would leave a rejection nobody waits for.
  const port = await Promise.race([said, exited.then(() => undefined)]);
  if (port === undefined) throw new Error("evals: jarvis exited before it listened");
  return port;
}
