import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

// Each test reads a registry of its own: the module holds the panel's values for its page.
const fresh = () => import("./tuning.ts");

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

it("gives the code's own value until the panel sets one, and keeps it as the default", async () => {
  const { tuned, tunedDefaults } = await fresh();
  expect(tunedDefaults().size).toBe(0);
  expect(tuned("grade.exposure", 0.8)).toBe(0.8);
  expect([...tunedDefaults()]).toEqual([["grade.exposure", 0.8]]);
});

it("gives the panel's value once set, and the code's again once cleared", async () => {
  const { setTuned, tuned } = await fresh();
  tuned("grade.exposure", 0.8);
  setTuned("grade.exposure", 1.3);
  expect(tuned("grade.exposure", 0.8)).toBe(1.3);
  setTuned("grade.exposure", undefined);
  expect(tuned("grade.exposure", 0.8)).toBe(0.8);
});

it("holds a value of 0 as a value, not as none", async () => {
  const { setTuned, tuned } = await fresh();
  setTuned("grade.exposure", 0);
  expect(tuned("grade.exposure", 0.8)).toBe(0);
});

it("keeps the first value read as the default, whatever a later read passes", async () => {
  const { tuned, tunedDefaults } = await fresh();
  tuned("grade.exposure", 0.8);
  expect(tuned("grade.exposure", 0.5)).toBe(0.5);
  expect(tunedDefaults().get("grade.exposure")).toBe(0.8);
});

it("holds a value the panel sets before the code reads it, and the code's default with it once read", async () => {
  const { setTuned, tuned, tunedDefaults } = await fresh();
  setTuned("grade.exposure", 1.1);
  expect(tunedDefaults().size).toBe(0);
  expect(tuned("grade.exposure", 0.8)).toBe(1.1);
  expect(tunedDefaults().get("grade.exposure")).toBe(0.8);
});

it("applies a followed value at once and at each change, the code's back when cleared", async () => {
  const { applyTuned, setTuned, tunedDefaults } = await fresh();
  const seen: number[] = [];
  applyTuned("grade.exposure", 0.8, (value) => seen.push(value));
  expect(seen).toEqual([0.8]);
  expect(tunedDefaults().get("grade.exposure")).toBe(0.8);
  setTuned("grade.exposure", 1.4);
  setTuned("grade.exposure", undefined);
  expect(seen).toEqual([0.8, 1.4, 0.8]);
});

it("gives a follower made after a change the panel's value at once, the code's default kept", async () => {
  const { applyTuned, setTuned, tunedDefaults } = await fresh();
  setTuned("grade.exposure", 1.2);
  const seen: number[] = [];
  applyTuned("grade.exposure", 0.8, (value) => seen.push(value));
  expect(seen).toEqual([1.2]);
  expect(tunedDefaults().get("grade.exposure")).toBe(0.8);
});

it("applies to the latest follower of a value alone, the first default kept, so a renderer made again lets the old one go", async () => {
  const { applyTuned, setTuned, tunedDefaults } = await fresh();
  const old: number[] = [];
  const now: number[] = [];
  applyTuned("grade.exposure", 0.8, (value) => old.push(value));
  applyTuned("grade.exposure", 0.6, (value) => now.push(value));
  setTuned("grade.exposure", 1.2);
  setTuned("grade.exposure", undefined);
  expect(old).toEqual([0.8]);
  expect(now).toEqual([0.6, 1.2, 0.6]);
  expect(tunedDefaults().get("grade.exposure")).toBe(0.8);
});

it("clears a value never set, and sets one nobody follows, without a word", async () => {
  const { applyTuned, setTuned, tuned } = await fresh();
  expect(() => {
    setTuned("grade.exposure", 1.2);
  }).not.toThrow();
  expect(tuned("grade.exposure", 0.8)).toBe(1.2);
  setTuned("grade.exposure", undefined);
  const seen: number[] = [];
  applyTuned("grade.exposure", 0.8, (value) => seen.push(value));
  setTuned("grade.exposure", undefined);
  expect(seen).toEqual([0.8, 0.8]);
});

it("names the values the panel tunes, each once, a dotted name a build can be searched for", async () => {
  const { TUNABLES } = await fresh();
  expect(TUNABLES).toContain("grade.exposure");
  expect(new Set(TUNABLES).size).toBe(TUNABLES.length);
  for (const name of TUNABLES) expect(name).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/);
});

// The switch is the lab's alone: its config defines it, as the reads compare it, and the site's configs neither name it nor widen Vite's
// own `VITE_` prefix, so no env file and no variable of the shell sets it. The lab's servers answer only on this machine, by exact names.
const LabConfig = z.object({
  define: z.record(z.string(), z.string()),
  optimizeDeps: z.object({ entries: z.array(z.string()) }),
  server: z.object({
    host: z.literal("127.0.0.1"),
    strictPort: z.literal(true),
    allowedHosts: z.array(z.string()),
    fs: z.object({ allow: z.array(z.string()) }),
  }),
  preview: z.object({ host: z.literal("127.0.0.1"), allowedHosts: z.array(z.string()) }),
});
const LAB_CONFIG = new URL("../../lab.config.ts", import.meta.url).href;
const labConfig = async () => {
  const read: unknown = await import(/* @vite-ignore */ LAB_CONFIG);
  return LabConfig.parse(z.object({ default: z.unknown() }).parse(read).default);
};

it("is defined by the lab's config alone, as the reads compare it", async () => {
  const { define } = await labConfig();
  expect(define["import.meta.env.GNOWORLD_TUNING"]).toBe('"1"');
  for (const site of ["../../vite.config.ts", "../../react-router.config.ts"]) {
    const text = readFileSync(new URL(site, import.meta.url).pathname, "utf8");
    expect(text, site).not.toContain("GNOWORLD_TUNING");
    expect(text, site).not.toContain("envPrefix");
  }
});

// Over the tailnet, the dev server serves files by path (/@fs/): the lab's own folders and the packages' store, never the repository's root,
// whose deploy/ holds secrets. A worktree's store is the main checkout's, through a link: its fonts come from there.
it("serves the app, the packages and their store alone, never deploy/, and scans the lab's own page", async () => {
  const { server, optimizeDeps } = await labConfig();
  const repository = new URL("../../../", import.meta.url).pathname;
  const reaches = (folder: string) => server.fs.allow.some((allowed) => `${folder}/`.startsWith(`${allowed}/`));
  expect(server.fs.allow).toHaveLength(3);
  expect(reaches(`${repository}deploy/secrets`), "deploy/").toBe(false);
  expect(reaches(repository.replace(/\/$/, "")), "the repository's root").toBe(false);
  expect(server.fs.allow.some((allowed) => allowed.endsWith("/app"))).toBe(true);
  expect(server.fs.allow.some((allowed) => allowed.endsWith("/packages"))).toBe(true);
  expect(server.fs.allow.some((allowed) => allowed.endsWith("/node_modules/.pnpm"))).toBe(true);
  expect(optimizeDeps.entries).toEqual(["realism.html"]);
});

it("serves the lab on this machine alone, to the exact hosts WORKSHOP_HOSTS names", async () => {
  expect((await labConfig()).server.allowedHosts).toEqual([]);
  vi.stubEnv("WORKSHOP_HOSTS", "box.tail.ts.net,100.64.0.1");
  vi.resetModules();
  const { server, preview } = await labConfig();
  expect(server.allowedHosts).toEqual(["box.tail.ts.net", "100.64.0.1"]);
  expect(preview.allowedHosts).toEqual(["box.tail.ts.net", "100.64.0.1"]);
});

// The app's screens on the workshop's other dev server (scripts/workshop.sh, Alexis, 2026-11-04: the ping-pong): the same guards as the lab's,
// which `react-router dev` alone left open, /@fs/ serving the repository's root and deploy/ with it.
const AppConfig = z.object({
  server: z.object({
    host: z.literal("127.0.0.1"),
    strictPort: z.literal(true),
    allowedHosts: z.array(z.string()),
    fs: z.object({ allow: z.array(z.string()) }),
  }),
});
const APP_CONFIG = new URL("../../vite.config.ts", import.meta.url).href;
const appConfig = async () => {
  const read: unknown = await import(/* @vite-ignore */ APP_CONFIG);
  return AppConfig.parse(z.object({ default: z.unknown() }).parse(read).default);
};

it("serves the app's screens as the lab's: this machine alone, the hosts WORKSHOP_HOSTS names, the lab's folders by path", async () => {
  const lab = await labConfig();
  const { server } = await appConfig();
  expect(server.allowedHosts).toEqual([]);
  expect(server.fs.allow).toEqual(lab.server.fs.allow);
  vi.stubEnv("WORKSHOP_HOSTS", "box.tail.ts.net,100.64.0.1");
  vi.resetModules();
  expect((await appConfig()).server.allowedHosts).toEqual(["box.tail.ts.net", "100.64.0.1"]);
  // A tailnet with no address yet gives `name,`: no empty name is allowed.
  vi.stubEnv("WORKSHOP_HOSTS", "box.tail.ts.net,");
  vi.resetModules();
  expect((await appConfig()).server.allowedHosts).toEqual(["box.tail.ts.net"]);
});
