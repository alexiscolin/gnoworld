// The workshop's crowd (Alexis, 2026-11-07: "simulate fake accounts present on the site, some with messages"): N simulated people
// on the workshop, each a page in one headless Chromium (one context each, no scene), the writers logged in with Adena's stand-in and
// a test wallet (signer.ts, never a real key) and saying a "(sim)" line in their room every 20-90 s. Ctrl-C leaves cleanly.
// By hand only, never in the gate: node tests/e2e/crowd.mjs [--people 12] [--writers 5] [--base http://127.0.0.1:5198]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wallet } from "../../../server/src/testing/signer.ts";
import { adena } from "./adena.ts";

export const parse = (argv) => {
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? fallback : (argv[at + 1] ?? "");
  };
  const base = new URL(flag("base", "http://127.0.0.1:5198"));
  if (!["127.0.0.1", "localhost"].includes(base.hostname) || base.protocol !== "http:")
    throw new Error(`crowd: only the workshop on 127.0.0.1 or localhost, never ${base.origin}`);
  const count = (name, fallback) => {
    const n = Number(flag(name, fallback));
    if (!Number.isInteger(n) || n < 0) throw new Error(`crowd: --${name} is a whole number`);
    return n;
  };
  const people = count("people", 12);
  return { base: base.origin, people, writers: Math.min(count("writers", 5), people) };
};

// Earth gets half the crowd, the hubs' worlds (app/data/hubs.json) share the rest.
const WORLDS = ["bubble", "govdao", "adena", "gnoswap", "gnomcp", "gnosh-ai"];
const placeOf = (n) => (n % 2 === 0 ? "/earth" : `/w/${WORLDS[(n >> 1) % WORLDS.length]}?chat=full`);
const SAYS = [
  "gm gno.land",
  "new GovDAO proposal is up, reading it now",
  "just voted YES on the latest proposal",
  "deployed my first realm on onyx, it renders!",
  "anyone tried the new gnoswap pools?",
  "gnomcp makes calling realms so easy",
  "welcome to the new folks here",
  "the testnet is fast today",
  "who is going to the next gno meetup?",
  "tx went through in two blocks",
  "reading r/gov/dao's Render, nice output",
  "hello from the sim crowd",
];
// What most writers declare, a random country each, kept where the room's menu keeps it (lib/country.ts: opt-in, on the device).
const COUNTRIES = [
  "PT",
  "FR",
  "DE",
  "ES",
  "IT",
  "NL",
  "BR",
  "US",
  "CA",
  "JP",
  "KR",
  "IN",
  "NG",
  "KE",
  "ZA",
  "AR",
  "AU",
  "SE",
  "PL",
  "TR",
];
// The writers' test wallets, kept between runs: a fresh wallet is a new account, which the login refuses past its hour's quota
// (429 "too many"), leaving the room empty. Test keys of the workshop's own, never a real one.
const KEYS = join(tmpdir(), "gnoworld-crowd-wallets.json");
const walletOf = (n) => {
  const kept = existsSync(KEYS) ? JSON.parse(readFileSync(KEYS, "utf8")) : {};
  const made = wallet(kept[n]);
  if (kept[n] === undefined) writeFileSync(KEYS, JSON.stringify({ ...kept, [n]: made.pem }));
  return made;
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function person(browser, base, n, writes, stopped) {
  const arrived = await arrive(browser, base, n, writes);
  if (writes)
    void write(arrived, n, stopped).catch((error) =>
      console.error(`crowd: writer ${n}:`, error.message.split("\n")[0]),
    );
}

async function arrive(browser, base, n, writes) {
  const context = await (await browser.open()).newContext({ baseURL: base });
  const page = await context.newPage();
  const place = placeOf(n);
  if (writes) {
    const test = walletOf(n);
    await adena(page, "signs", `sim-${n}`); // the stand-in asks /__wallet and /__sign: answered here, by a wallet of its own
    await page.route("**/__wallet*", (route) => route.fulfill({ json: { address: test.address } }));
    await page.route("**/__sign*", (route) => {
      const { chainId, signer, data } = JSON.parse(route.request().postData() ?? "{}");
      return route.fulfill({ json: test.sign(chainId, data, signer) });
    });
    if (Math.random() < 0.8) {
      const entry = [`gnoworld:country:${test.address}`, JSON.stringify(pick(COUNTRIES))];
      await context.addInitScript(([key, value]) => localStorage.setItem(key, value), entry);
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Adena" }).click();
    await page
      .getByRole("button", { name: /Your account/ })
      .waitFor()
      .catch(() => {
        throw new Error(
          "could not log in (a 429 means the login's hourly quota of new accounts or its per-minute calls is spent)",
        );
      });
  }
  await page.goto(place);
  return page;
}

async function write(page, n, stopped) {
  const field = page.getByRole("textbox", { name: /^Message #/ });
  // The earth's dock loads its chat after the scene's first frames: a slow machine needs more than 30 s.
  await field.waitFor({ timeout: 120_000 });
  while (!stopped()) {
    await sleep(20_000 + Math.random() * 70_000);
    if (stopped()) break;
    const text = `${pick(SAYS)} (sim)`;
    await field.fill(text);
    await field.press("Enter");
    // A line that never shows in its own room went nowhere: said, so a silent room is not a mystery.
    await page
      .getByText(text)
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => console.error(`crowd: writer ${n}: "${text}" never showed in its room`));
  }
}

async function main() {
  const { base, people, writers } = parse(process.argv.slice(2));
  const { chromium } = await import("@playwright/test");
  // Outside Claude's sandbox: one Chromium, a context each. Inside it Chromium runs as one process, where a second context ends
  // the browser (fixtures.ts): a browser each, heavier (playwright.config.ts).
  const alone = Boolean(process.env.SANDBOX_RUNTIME);
  const launched = [];
  const launch = async () => {
    const one = await chromium.launch({ args: alone ? ["--single-process"] : [] });
    launched.push(one);
    return one;
  };
  const shared = alone ? undefined : await launch();
  const browser = { open: async () => shared ?? (await launch()) };
  let over = false;
  const done = async () => {
    over = true;
    await Promise.all(launched.map((one) => one.close().catch(() => {})));
    process.exit(0);
  };
  process.on("SIGINT", done);
  process.on("SIGTERM", done);
  console.log(`crowd: ${people} people, ${writers} writing, on ${base}; Ctrl-C to stop`);
  for (let n = 0; n < people; n++)
    // one at a time: a single-process Chromium (Claude Code's sandbox) fails on two new pages at once
    await person(browser, base, n, n < writers, () => over).catch((error) =>
      console.error(`crowd: person ${n}:`, error.message.split("\n")[0]),
    );
}

// Run, not imported by its test: the command line names this file.
if (process.argv[1]?.endsWith("crowd.mjs") === true) await main();
