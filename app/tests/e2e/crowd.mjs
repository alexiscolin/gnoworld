// The workshop's crowd: N simulated people, each a page in one headless Chromium (no scene); the writers log in with Adena's stand-in and a
// test wallet (signer.ts, never a real key), or write as guests. By hand only: node tests/e2e/crowd.mjs [--people 12] [--writers 5]
// [--guests 0] [--bare 0] [--base http://127.0.0.1:5198] [--script file] [--every 10] [--minutes 15]: the writers act the file's lines, one
// every --every to 1.5 x --every seconds, again till --minutes are over; without a script, a "(sim)" line now and then. With R rooms, the
// first R writers are each room's foreign speaker (crowdLanguages.json), the next R declare the US, then --bare ones declare nothing and the
// last --guests are guests: `--people 28 --writers 24 --guests 6 --bare 6` is four writers a room.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wallet } from "../../../server/src/testing/signer.ts";
import { adena } from "./adena.ts";
import { connectButton } from "./account.ts";
import { closeButton, threadField, threadOf } from "./thread.ts";

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
  const writers = Math.min(count("writers", 5), people);
  const file = flag("script", undefined);
  const script = file === undefined ? undefined : scriptOf(readFileSync(file, "utf8"), writers);
  const guests = Math.min(count("guests", 0), writers);
  const bare = Math.min(count("bare", 0), writers - guests);
  return {
    base: base.origin,
    people,
    writers,
    guests,
    bare,
    script,
    every: count("every", 10),
    minutes: count("minutes", 0),
  };
};

// A script's lines, `<room>|text` or `<room>|<one of KINDS>|text`, in `earth`, an Earth room `earth/<name>`, a hub's world or `/r/<path>`:
// a reply, reaction (REACTIONS), thread's line or edit goes to the room's last line said, a vote to its last poll's answer named. `\n`
// breaks a line; `@{prev}` mentions the room's last speaker with a key; no line may begin "@jarvis ", which is asked of Jarvis.
export const scriptOf = (text, writers) => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const [room = "", second = "", ...rest] = line.split("|");
      const kind = KINDS.includes(second.trim()) && rest.length > 0 ? second.trim() : "say";
      const said = kind === "say" ? [second, ...rest].join("|") : rest.join("|");
      return { room, kind, text: said.trim().replaceAll("\\n", "\n") };
    });
  const known = (room) =>
    room === "earth" ||
    WORLDS.includes(room) ||
    /^earth\/[a-z0-9]+(-[a-z0-9]+)*$/.test(room) ||
    /^\/r\/[a-z0-9_.-]+(\/[a-z0-9_.-]+)+$/.test(room);
  if (lines.length === 0 || lines.some(({ room, text }) => text === "" || !known(room)))
    throw new Error(
      "crowd: a script line is `earth|text`, `earth/<room>|text`, `<hub's world>|text` or `/r/<realm path>|text`",
    );
  if (lines.some(({ text }) => /^@jarvis\b/i.test(text)))
    throw new Error("crowd: a script line never starts with @jarvis");
  if (lines.some(({ kind, text }) => kind === "react" && !REACTIONS.includes(text)))
    throw new Error(`crowd: a reaction is one of ${REACTIONS.join(" ")}`);
  const said = new Set();
  for (const { room, kind } of lines) {
    if (kind !== "say" && !said.has(room)) throw new Error(`crowd: a ${kind} in ${room} comes after a line said there`);
    said.add(room);
  }
  const rooms = [...new Set(lines.map(({ room }) => room))];
  if (writers < rooms.length) throw new Error("crowd: a script needs a writer in each of its rooms");
  return { lines, rooms };
};

const KINDS = ["reply", "thread", "react", "vote", "edit"];
const REACTIONS = ["👍", "❤️", "😂"];

// Without a script, Earth gets half the crowd, the hubs' worlds (app/data/hubs.json) share the rest.
const WORLDS = ["bubble", "govdao", "adena", "gnoswap", "gnomcp", "gnosh-ai"];
const pageOf = (room) => {
  if (room === "earth") return "/earth";
  if (room.startsWith("earth/")) return `/earth?chat=full&room=${room.slice("earth/".length)}`;
  return room.startsWith("/") ? `${room}?chat=full` : `/w/${room}?chat=full`;
};
const placeOf = (n, rooms) =>
  rooms === undefined
    ? pageOf(n % 2 === 0 ? "earth" : WORLDS[(n >> 1) % WORLDS.length])
    : pageOf(rooms[n % rooms.length]);
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
// What the writers declare, a different one each from a random start, kept where the room's menu keeps it (lib/country.ts: opt-in, on the
// device).
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
// The script's rooms, each with the language its first writer speaks and that speaker's country, and every plain line said in it
// (the Jarvis stand-in reads the same file to translate them).
export const languages = JSON.parse(
  readFileSync(new URL("../../../server/src/testing/crowdLanguages.json", import.meta.url), "utf8"),
);
// With a script, writer n of its R rooms is in room n % R, as the Rth of them at slot floor(n / R): slot 0 speaks the room's language
// and declares its country, slot 1 declares the United States, the rest as the other writers do.
export const countryOf = ({ n }, rooms) => {
  if (rooms === undefined) return undefined;
  const slot = Math.floor(n / rooms.length);
  return slot === 0 ? languages[rooms[n]]?.country : slot === 1 ? "US" : undefined;
};
export const saidBy = ({ n, guest }, rooms, room, text) =>
  rooms !== undefined && n < rooms.length && !guest && !isCard(text) ? (languages[room]?.lines[text] ?? text) : text;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const FIRST_COUNTRY = Math.floor(Math.random() * COUNTRIES.length);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A writer's page once it has arrived; one that writes alone starts at once, unless a script has the room first.
async function person(browser, base, role, stopped, script) {
  const { n, writes, guest } = role;
  const arrived = await arrive(browser, base, role, script?.rooms);
  if (writes && script === undefined) void writeAlone(arrived, n, stopped);
  return writes ? { page: arrived, n, guest, address: guest ? undefined : walletOf(n).address } : undefined;
}

const writeAlone = (page, n, stopped) =>
  write(page, n, stopped).catch((error) => console.error(`crowd: writer ${n}:`, error.message.split("\n")[0]));

// Each writer's session kept between runs, beside its wallet: a run started again logs in nobody the server still knows.
const SESSIONS = join(tmpdir(), "gnoworld-crowd-sessions");
const sessionOf = (n) => join(SESSIONS, `${String(n)}.json`);

async function arrive(browser, base, { n, writes, guest, bare }, rooms) {
  const kept = writes && !guest && existsSync(sessionOf(n)) ? { storageState: sessionOf(n) } : {};
  const context = await (await browser.open()).newContext({ baseURL: base, ...kept });
  const page = await context.newPage();
  const place = placeOf(n, rooms);
  if (writes && !guest) {
    const test = walletOf(n);
    await adena(page, "signs", `sim-${n}`); // the stand-in asks /__wallet and /__sign: answered here, by a wallet of its own
    await page.route("**/__wallet*", (route) => route.fulfill({ json: { address: test.address } }));
    await page.route("**/__sign*", (route) => {
      const { chainId, signer, data } = JSON.parse(route.request().postData() ?? "{}");
      return route.fulfill({ json: test.sign(chainId, data, signer) });
    });
    const entry = [
      `gnoworld:country:${test.address}`,
      JSON.stringify(countryOf({ n }, rooms) ?? COUNTRIES[(FIRST_COUNTRY + n) % COUNTRIES.length]),
    ];
    if (!bare) await context.addInitScript(([key, value]) => localStorage.setItem(key, value), entry);
    await logIn(page, n);
    mkdirSync(SESSIONS, { recursive: true });
    await context.storageState({ path: sessionOf(n) });
  }
  // The script's Earth rooms are made by the first writer, once logged in, before anyone goes there; one that exists is left as it is.
  if (n === 0 && writes && !guest)
    for (const room of (rooms ?? []).filter((each) => each.startsWith("earth/"))) await makeRoom(page, room.slice(6));
  await page.goto(place);
  // A guest has no key: its box asks the server a name as it takes the focus, and every line it says goes through the moderation.
  if (guest) {
    // A room closed to guests draws no box: 45 s, not the dock's two minutes, before this guest gives up.
    await (await fieldOf(page, 45_000)).click();
    await page
      .getByText(/You speak as /)
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => {
        throw new Error("got no guest name (the guest chat needs the moderation's key: WORKSHOP_OPENAI_KEY_FILE)");
      });
  }
  return page;
}

// An Earth room made by the page's account, as the New room dialog makes one; its name goes through the moderation first.
async function makeRoom(page, name) {
  const status = await page.evaluate(
    (room) =>
      fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ world: "earth", name: room }),
      }).then((answer) => answer.status),
    name,
  );
  if (status !== 201 && status !== 409)
    console.error(`crowd: the Earth room "${name}" was not made (${String(status)})`);
}

// The login takes ten calls a minute from one address, which the whole crowd shares (and the presenter beside it): a writer refused waits a
// minute and tries again, a few times, rather than staying out of its room.
const LOGIN_TRIES = 6;
async function logIn(page, n) {
  await page.goto("/");
  const still = await page
    .getByRole("button", { name: /Your account/ })
    .waitFor({ timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  if (still) return;
  for (let tried = 1; ; tried += 1) {
    await page.goto("/");
    await connectButton(page).click();
    const done = await page
      .getByRole("button", { name: /Your account/ })
      .waitFor({ timeout: 20_000 })
      .then(
        () => true,
        () => false,
      );
    if (done) return;
    if (tried === LOGIN_TRIES)
      throw new Error(`could not log in after ${String(tried)} tries (the login's per-minute calls)`);
    console.error(`crowd: writer ${String(n)}: login refused for now, again in a minute`);
    await sleep(65_000);
  }
}

// The earth's dock loads its chat after the scene's first frames: a slow machine needs more than 30 s.
async function fieldOf(page, timeout = 120_000) {
  const field = page.getByRole("textbox", { name: /^Message #/ });
  await field.waitFor({ timeout });
  return field;
}

// The room's lines, as the journeys read them (chat.ts, which this plain script cannot import), and a line's bar of actions.
const linesOf = (page) => page.getByRole("list", { name: "Messages" }).locator(":scope > li");
const barOf = (line) => line.getByRole("toolbar", { name: "Actions on this message" });
// A card's command goes as it is typed; any other line carries the "(sim)" mark, on its last line.
const isCard = (text) => /^\/(market|trending|proposals|poll)\b/i.test(text);
const marked = (text) => (isCard(text) ? text : `${text} (sim)`);
const LIST_MARK = /^(- |\d+\. )/;
// The words a line shows first, without its marks: what finds it again among the room's lines.
export const keyOf = (text) =>
  (text.split("\n")[0] ?? "")
    .split("@")[0]
    .replace(/^\/me /, "")
    .replace(LIST_MARK, "")
    .replace(/[*_~+`>]/g, "")
    .trim()
    .slice(0, 40);

/** Types `text` in `field`, its breaks as Shift+Enter, and sends it; `replace` types over what the field holds (an edit's old text).
 * A line that never shows in its room is told, not hidden. */
async function send(page, field, n, text, replace = false) {
  const [first = "", ...more] = marked(text).split("\n");
  // Key by key: the composer reads its marks (bold, code, lists, quotes) as they are typed, and a pasted text stays literal.
  await field.click();
  if (replace) {
    // Emptied first: a first letter outside the keyboard (à, ¡) is inserted, not typed, and would leave the selection standing.
    await field.press("ControlOrMeta+a");
    await field.press("Backspace");
  }
  await field.pressSequentially(first);
  let before = first;
  for (const each of more) {
    await field.press("Shift+Enter");
    // A list goes on by itself after a break: its next mark typed again would stay text.
    await field.pressSequentially(LIST_MARK.test(before) ? each.replace(LIST_MARK, "") : each);
    before = each;
  }
  await field.press("Enter");
  if (isCard(text)) return;
  await page
    .getByText(keyOf(text))
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => console.error(`crowd: writer ${n}: "${keyOf(text)}" never showed in its room`));
}

const say = (page, field, n, line) => send(page, field, n, line);

async function write(page, n, stopped) {
  const field = await fieldOf(page);
  while (!stopped()) {
    await sleep(20_000 + Math.random() * 70_000);
    if (stopped()) break;
    await say(page, field, n, pick(SAYS));
  }
}

// What a script line needs of its writer: a key for all but a plain line, and for a plain line its own edit follows.
const needsKey = ({ kind, text }, edited) => kind !== "say" || isCard(text) || text.includes("@{prev}") || edited;
const pollOf = (text) => /^\/poll\s+([^|]+)\|/i.exec(text)?.[1]?.trim();
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The script once, each line by the next writer of its room able to; an edit by the writer of the line it fixes.
async function play({ lines, rooms }, every, writers, stopped) {
  const edited = lines.map(({ room }, at) => lines.slice(at + 1).find((next) => next.room === room)?.kind === "edit");
  const turns = new Map();
  const last = new Map();
  for (const [at, line] of lines.entries()) {
    if (stopped()) return;
    const { room, kind } = line;
    const keyed = needsKey(line, edited[at]);
    const able = writers.filter(({ n, guest }) => rooms[n % rooms.length] === room && !(keyed && guest));
    const turn = turns.get(room) ?? 0;
    turns.set(room, turn + 1);
    const was = last.get(room) ?? {};
    const sayer = kind === "edit" ? was.speaker : able[turn % Math.max(able.length, 1)];
    const prev = [was.speaker, ...able].find((one) => one?.address !== undefined && one !== sayer);
    const text = (sayer === undefined ? line.text : saidBy(sayer, rooms, room, line.text)).replaceAll(
      "@{prev}",
      prev === undefined ? "" : `@${prev.address}`,
    );
    const to = kind === "thread" ? was.root : kind === "vote" ? was.poll : was.line;
    // A line that fails, or whose room lost its writers, is told and skipped: a long run goes on with the writers left.
    if (sayer === undefined) console.error(`crowd: no writer able in ${room}: ${kind} "${keyOf(text)}" not done`);
    else
      await act(sayer, { kind, text, to }).catch((error) =>
        console.error(`crowd: writer ${sayer.n}: ${kind} "${keyOf(text)}" not done:`, error.message.split("\n")[0]),
      );
    const poll = pollOf(text) ?? was.poll;
    if (["say", "reply", "edit"].includes(kind))
      last.set(room, { line: keyOf(text), root: kind === "edit" ? was.root : keyOf(text), speaker: sayer, poll });
    else last.set(room, { ...was, speaker: kind === "thread" ? sayer : was.speaker });
    // At least `every` seconds, up to half again: a room's pace is never even.
    await sleep(every * 1000 * (1 + Math.random() / 2));
  }
}

// One line of the script on its writer's page: said; or, to the line `to`, a reply, a thread's line, a reaction or an edit; or a vote for
// the answer `text` of the poll `to`.
async function act({ page, n }, { kind, text, to }) {
  // The writer's box, found at each line: a page that reloaded (a hot update) has a new one; a page with none (an error drawn in its place)
  // is loaded again once, and if it still has none this line alone is skipped.
  const field = () =>
    fieldOf(page, 30_000).catch(async () => {
      await page.reload();
      return fieldOf(page, 60_000);
    });
  if (kind === "say") return send(page, await field(), n, text);
  if (kind === "vote")
    return page
      .getByRole("group", { name: `Poll: ${to}` })
      .last()
      .getByRole("button", { name: new RegExp(`^${escaped(text)},`) })
      .click();
  const line = linesOf(page).filter({ hasText: to }).last();
  if (kind === "thread") {
    await threadOf(line);
    await send(page, threadField(page), n, text);
    return closeButton(page).click();
  }
  await line.hover();
  if (kind === "react")
    return barOf(line)
      .getByRole("button", { name: `React with ${text}` })
      .click();
  if (kind === "edit") {
    await barOf(line).getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
  } else await barOf(line).getByRole("button", { name: "Reply" }).click();
  return send(page, await field(), n, text, kind === "edit");
}

// The script as soon as everyone is in, from its first line again till `minutes` are over (once with none).
async function playFor(script, { every, minutes }, writers, stopped) {
  const end = Date.now() + minutes * 60_000;
  const over = () => stopped() || (minutes > 0 && Date.now() > end);
  console.log(
    `crowd: everyone is in; playing ${script.lines.length} lines, one every ${every} s${minutes > 0 ? `, for ${minutes} min` : ""}`,
  );
  do await play(script, every, writers, over);
  while (minutes > 0 && !over());
  console.log("crowd: the conversation is over; the people stay till Ctrl-C");
}

async function main() {
  const { base, people, writers, guests, bare, script, every, minutes } = parse(process.argv.slice(2));
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
  const writing = [];
  for (let n = 0; n < people; n++) {
    // one at a time: a single-process Chromium (Claude Code's sandbox) fails on two new pages at once
    const guest = n < writers && n >= writers - guests;
    const role = { n, writes: n < writers, guest, bare: !guest && n < writers && n >= writers - guests - bare };
    const one = await person(browser, base, role, () => over, script).catch((error) =>
      console.error(`crowd: person ${n}:`, error.message.split("\n")[0]),
    );
    if (one !== undefined) writing.push(one);
  }
  if (script !== undefined)
    await playFor(script, { every, minutes }, writing, () => over).catch((error) =>
      console.error("crowd: script:", error.message.split("\n")[0]),
    );
}

// Run, not imported by its test: the command line names this file.
if (process.argv[1]?.endsWith("crowd.mjs") === true) await main();
