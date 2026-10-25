import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const SOAK = fileURLToPath(new URL("soak.ts", import.meta.url));
// Set from the first run (2026-10-22, the feat commit says the numbers); only ever lowered.
const GROWTH = 0.1;

describe("the check, soaked", () => {
  // The heap's growth from the second checkpoint, once warm, to the last.
  const growth = (env: Record<string, string>): number => {
    const run = spawnSync(process.execPath, ["--expose-gc", SOAK], {
      encoding: "utf8",
      timeout: 120_000,
      env: { PATH: process.env["PATH"] ?? "", ...env },
    });
    expect(run.status, run.stderr).toBe(0);
    const heaps = z.array(z.number().positive()).length(10).parse(JSON.parse(run.stdout));
    const [warm = 0, last = 0] = [heaps[1], heaps[9]];
    return (last - warm) / warm;
  };

  it("keeps its heap flat over 100,000 messages, half from new accounts: under 10% once warm", () => {
    expect(growth({})).toBeLessThan(GROWTH);
  }, 120_000);

  it("would see a leak: a run that keeps every message grows past the bound", () => {
    expect(growth({ LEAK: "1" })).toBeGreaterThan(GROWTH);
  }, 120_000);
});
