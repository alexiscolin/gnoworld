import { CAPTURE_MAX_BYTES, Previews, PREVIEWS_MAX, PREVIEWS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Answer } from "../moderation/provider.ts";
import type { Send } from "../net.ts";
import { abciRefused, fakeChain, RPC, type Routes } from "../testing/fakeWorldsChain.ts";
import { failingFirst, proxyRefused, refused, timerWaits, unresolved } from "../testing/wayOut.ts";
import {
  capturedOf,
  checkFor,
  checkOf,
  EVERY_MS,
  PAGE_READ_MAX_BYTES,
  PAUSE_MS,
  READ_MS,
  runPreviews,
  startPreviews,
  type Check,
  type PreviewsOptions,
} from "./job.ts";

// The preview job (8f, slice 7's 7l): every six hours it reads the home page of each realm the team's data lists, through the chain's
// RPC (the way out's host already), keeps its first part, has the moderation check read that part, and writes previews.json beside and
// renamed over. One call at a time, each capped in time and size. No check, no capture; a page the check hides is never written.
const GOVDAO = "gno.land/r/gov/dao";
const MEMBA = "gno.land/r/samcrew/memba";
const NOW = Date.parse("2026-11-05T10:00:00.000Z");
const UNIVERSE = { id: "onyx", rpc: RPC };

const dir = mkdtempSync(join(tmpdir(), "gnoworld-previews-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
let n = 0;
const fresh = (): string => {
  n += 1;
  const folder = join(dir, `t${String(n)}`);
  mkdirSync(folder);
  return join(folder, "previews.json");
};

const passes: Check = () => Promise.resolve("pass");

interface Run {
  file: string;
  logged: { event: string; error?: string | undefined; ms?: number | undefined }[];
  lines: string[];
  chain: ReturnType<typeof fakeChain>;
  outcome: Awaited<ReturnType<typeof runPreviews>>;
  waits: number[];
  checked: string[];
}

async function run(
  routes: Routes,
  over: Partial<PreviewsOptions> & { pages?: readonly string[]; send?: Send } = {},
): Promise<Run> {
  const file = over.file ?? fresh();
  const logged: Run["logged"] = [];
  const lines: string[] = [];
  const chain = fakeChain(routes);
  const waits: number[] = [];
  const checked: string[] = [];
  const check = over.check ?? passes;
  let clock = NOW;
  const outcome = await runPreviews({
    file,
    universe: UNIVERSE,
    pages: [GOVDAO],
    send: chain.send,
    now: () => clock,
    wait: (ms) => {
      waits.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    log: (event, fields = {}) => {
      logged.push({ event, error: fields.error, ms: fields.ms });
      lines.push(JSON.stringify({ event, ...fields }));
    },
    ...over,
    check: (text) => {
      checked.push(text);
      return check(text);
    },
  });
  return { file, logged, lines, chain, outcome, waits, checked };
}

const read = (file: string) => Previews.parse(JSON.parse(readFileSync(file, "utf8")));
const paths = (file: string) => read(file).previews.map(({ path }) => path);
const page = (title: string) => `# ${title}\n## Proposals\n### Prop #37\n`;
const renders = (pages: Record<string, string | Response | Error>): Routes => ({
  render: (data) => {
    const path = data.replace(/:$/, "");
    return Object.hasOwn(pages, path) && data.endsWith(":") ? (pages[path] ?? "") : abciRefused();
  },
});
const EARLIER = "2026-11-04T10:00:00.000Z";
const earlier = (path: string, text = `# ${path}, as it was\n`) => ({ path, captured: EARLIER, text });
// A last file, as an earlier pass wrote it.
const lastFile = (file: string, previews: { path: string; captured: string; text: string }[], universe = "onyx") => {
  writeFileSync(file, JSON.stringify({ version: 1, universe, updated: EARLIER, previews }));
};
const busy = () => new Response("busy", { status: 503 });
const timedOut = () => Object.assign(new Error("the read took too long"), { name: "TimeoutError" });

describe("the job's caps, as the plan states them", () => {
  it("keeps 4,096 bytes of a page, reads 64 KiB of it at most within 10 s, 32 pages a pass, a quarter-second apart, every six hours", () => {
    expect(CAPTURE_MAX_BYTES).toBe(4096);
    expect(PAGE_READ_MAX_BYTES).toBe(65_536);
    expect(READ_MS).toBeLessThanOrEqual(10_000);
    expect(PREVIEWS_MAX).toBe(32);
    expect(PREVIEWS_MAX_BYTES).toBe(1_048_576);
    expect(PAUSE_MS).toBe(250);
    expect(EVERY_MS).toBe(6 * 60 * 60_000);
  });
});

describe("capturedOf, the part of a page a capture keeps", () => {
  it("keeps a page under its cap whole", () => {
    expect(capturedOf("# GovDAO\n## Members\n")).toBe("# GovDAO\n## Members\n");
    expect(capturedOf("a".repeat(4096))).toBe("a".repeat(4096));
  });

  it("cuts a longer page at the last line's end within its cap, in UTF-8 bytes", () => {
    const head = `${"a".repeat(4086)}\n`;
    expect(capturedOf(`${head}${"b".repeat(20)}\n`)).toBe(head);
    // A line's end on the cap's last byte is kept with its line.
    expect(capturedOf(`${"a".repeat(4095)}\nb`)).toBe(`${"a".repeat(4095)}\n`);
    // Three bytes a character: 1,400 of them, 4,200 bytes, are past the cap though fewer than it in characters.
    expect(capturedOf(`${"€".repeat(1300)}\n${"€".repeat(100)}`)).toBe(`${"€".repeat(1300)}\n`);
  });

  it("cuts a page of one long line between two characters, never in one, and never past its cap", () => {
    expect(capturedOf("😀".repeat(2000))).toBe("😀".repeat(1024));
    const odd = capturedOf(`a${"😀".repeat(2000)}`);
    expect(odd).toBe(`a${"😀".repeat(1023)}`);
    expect(Buffer.byteLength(odd, "utf8")).toBeLessThanOrEqual(4096);
  });
});

describe("a pass of the preview job", () => {
  it("reads each page's home once through vm/qrender, one call at a time, a pause apart, each under its time limit", async () => {
    const { chain, waits, outcome } = await run(renders({ [GOVDAO]: page("GovDAO"), [MEMBA]: page("Memba") }), {
      pages: [MEMBA, GOVDAO],
    });
    expect(outcome).toEqual({ wrote: true });
    expect(chain.asked.map(({ kind, data }) => [kind, data])).toEqual([
      ["vm/qrender", `${GOVDAO}:`],
      ["vm/qrender", `${MEMBA}:`],
    ]);
    expect(chain.parallel()).toBe(1);
    expect(waits).toEqual([250]);
    expect(chain.asked.every(({ ms }) => ms === READ_MS)).toBe(true);
    expect(chain.asked.every(({ init }) => init.method === "GET")).toBe(true);
    expect(chain.asked.every(({ url }) => url.startsWith("https://rpc.onyx.testnets.gno.land"))).toBe(true);
  });

  it("writes each checked capture by its path, at the time it was read, in the file the schema reads", async () => {
    const { file, checked } = await run(renders({ [GOVDAO]: page("GovDAO"), [MEMBA]: page("Memba") }), {
      pages: [MEMBA, GOVDAO],
    });
    expect(read(file)).toEqual({
      version: 1,
      universe: "onyx",
      updated: "2026-11-05T10:00:00.250Z",
      previews: [
        { path: GOVDAO, captured: "2026-11-05T10:00:00.000Z", text: page("GovDAO") },
        { path: MEMBA, captured: "2026-11-05T10:00:00.250Z", text: page("Memba") },
      ],
    });
    // What the check read is what is written, word for word: a reader sees nothing the check did not.
    expect(checked).toEqual([page("GovDAO"), page("Memba")]);
  });

  it("writes the first part of a long page, the part the check read", async () => {
    const long = `${"# GovDAO\n".repeat(400)}${"tail\n".repeat(400)}`;
    const { file, checked } = await run(renders({ [GOVDAO]: long }));
    const kept = capturedOf(long);
    expect(Buffer.byteLength(kept, "utf8")).toBeLessThanOrEqual(4096);
    expect(read(file).previews[0]?.text).toBe(kept);
    expect(checked).toEqual([kept]);
  });

  it("asks the chain for 64 KiB of a page at most: a page past them has no capture and reaches no check", async () => {
    const { file, logged, checked } = await run(renders({ [GOVDAO]: "a".repeat(65_537) }));
    expect(read(file).previews).toEqual([]);
    expect(logged).toContainEqual({ event: "previews_skipped", error: "too_large", ms: undefined });
    expect(checked).toEqual([]);
    const { file: exact } = await run(renders({ [GOVDAO]: "a".repeat(65_536) }));
    expect(paths(exact)).toEqual([GOVDAO]);
  });

  it("captures no page that is empty, or blank", async () => {
    for (const blank of ["", " \n\t\n"]) {
      const { file, checked, logged } = await run(renders({ [GOVDAO]: blank }));
      expect(read(file).previews).toEqual([]);
      expect(checked).toEqual([]);
      expect(logged).toContainEqual({ event: "previews_skipped", error: "empty", ms: undefined });
    }
  });

  it("checks a page that is no UTF-8 as no page", async () => {
    const bytes = Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]).toString("base64");
    const body = { result: { response: { ResponseBase: { Error: null, Data: bytes } } } };
    const { file, checked } = await run({ render: () => Response.json(body) });
    expect(read(file).previews).toEqual([]);
    expect(checked).toEqual([]);
  });

  it("writes no page the check hides, and says so by its kind", async () => {
    const { file, logged } = await run(renders({ [GOVDAO]: page("GovDAO") }), { check: () => Promise.resolve("hide") });
    expect(read(file).previews).toEqual([]);
    expect(logged).toContainEqual({ event: "previews_skipped", error: "hidden", ms: undefined });
  });

  it("drops a page the check hides now, though an earlier pass kept it", async () => {
    const file = fresh();
    lastFile(file, [earlier(GOVDAO)]);
    await run(renders({ [GOVDAO]: page("GovDAO, changed") }), { file, check: () => Promise.resolve("hide") });
    expect(read(file).previews).toEqual([]);
  });

  it("writes no fresh capture the check could not read: no check, no preview", async () => {
    const { file, logged } = await run(renders({ [GOVDAO]: page("GovDAO") }), {
      check: () => Promise.resolve("unchecked"),
    });
    expect(read(file).previews).toEqual([]);
    expect(logged).toContainEqual({ event: "previews_skipped", error: "unchecked", ms: undefined });
  });

  it("keeps a page's last checked capture, with its own time, when the check, the network or the chain fails now", async () => {
    for (const [route, check] of [
      [page("GovDAO"), () => Promise.resolve("unchecked" as const)],
      [busy(), passes],
      [timedOut(), passes],
      [abciRefused("/vm.SomeOtherError"), passes],
    ] as const) {
      const file = fresh();
      lastFile(file, [earlier(GOVDAO)]);
      await run(renders({ [GOVDAO]: route }), { file, check });
      expect(read(file).previews).toEqual([earlier(GOVDAO)]);
    }
  });

  it("drops a page the chain says is gone, and keeps nothing from another universe's file", async () => {
    const gone = fresh();
    lastFile(gone, [earlier(GOVDAO)]);
    await run({ render: () => abciRefused("/vm.InvalidPkgPathError") }, { file: gone });
    expect(read(gone).previews).toEqual([]);
    const other = fresh();
    lastFile(other, [earlier(GOVDAO)], "gnoland");
    await run(renders({ [GOVDAO]: busy() }), { file: other });
    expect(read(other).previews).toEqual([]);
  });

  it("drops a last capture of a page the data no longer lists, and writes none with no page", async () => {
    const file = fresh();
    lastFile(file, [earlier(GOVDAO), earlier(MEMBA)]);
    await run(renders({ [GOVDAO]: busy() }), { file });
    expect(paths(file)).toEqual([GOVDAO]);
    const none = fresh();
    lastFile(none, [earlier(GOVDAO)]);
    const { outcome, chain } = await run(renders({}), { file: none, pages: [] });
    expect(outcome).toEqual({ wrote: true });
    expect(chain.asked).toEqual([]);
    expect(read(none).previews).toEqual([]);
  });

  it("reads a last file that is no JSON, of another shape or past its cap as none, and still writes", async () => {
    for (const text of ["{nope", JSON.stringify({ version: 2 }), `{"pad":"${"x".repeat(PREVIEWS_MAX_BYTES)}"}`]) {
      const file = fresh();
      writeFileSync(file, text);
      const { outcome } = await run(renders({ [GOVDAO]: busy() }), { file });
      expect(outcome).toEqual({ wrote: true });
      expect(read(file).previews).toEqual([]);
    }
  });

  it("writes kept and fresh captures in the one order the schema reads, siblings with -, / and _ among them", async () => {
    const file = fresh();
    const last = "gno.land/r/zz/last";
    lastFile(file, [earlier(last)]);
    const siblings = ["gno.land/r/a_b", "gno.land/r/a/b", "gno.land/r/a-b"];
    const pages: Record<string, string | Response> = { [last]: busy() };
    for (const path of siblings) pages[path] = page(path);
    await run(renders(pages), { file, pages: [last, ...siblings] });
    expect(paths(file)).toEqual(["gno.land/r/a-b", "gno.land/r/a/b", "gno.land/r/a_b", last]);
  });

  it("goes on past a page that fails, whatever the fault, and captures the next", async () => {
    for (const fault of [busy(), timedOut(), "a".repeat(65_537), new Response("{not json", { status: 200 })]) {
      const { file, chain } = await run(renders({ [GOVDAO]: fault, [MEMBA]: page("Memba") }), {
        pages: [GOVDAO, MEMBA],
      });
      expect(chain.asked).toHaveLength(2);
      expect(paths(file)).toEqual([MEMBA]);
    }
  });

  it("writes the file and says each page's fault when every read fails, keeping what was kept", async () => {
    const file = fresh();
    lastFile(file, [earlier(GOVDAO)]);
    const { outcome, logged } = await run(renders({ [GOVDAO]: busy(), [MEMBA]: busy() }), {
      file,
      pages: [GOVDAO, MEMBA],
    });
    expect(outcome).toEqual({ wrote: true });
    expect(logged.map(({ event, error }) => [event, error])).toEqual([
      ["previews_skipped", "status"],
      ["previews_skipped", "status"],
      ["previews_written", undefined],
    ]);
    expect(read(file).previews).toEqual([earlier(GOVDAO)]);
  });

  const fetchFault = () => new TypeError("fetch failed");
  it.each([
    ["the way out's name with no address yet", [unresolved, unresolved], ["unresolved", "unresolved"]],
    ["nothing listening where the way out will be", [refused, refused], ["refused", "refused"]],
    ["the way out starting between two reads", [unresolved, refused], ["unresolved", "refused"]],
  ] as const)(
    "writes nothing on %s, when no read reached anyone, keeps the last file byte for byte, and says the last read's kind (F4872)",
    async (_name, [govdao, memba], [first, last]) => {
      const file = fresh();
      lastFile(file, [earlier(GOVDAO)]);
      const before = readFileSync(file, "utf8");
      const { outcome, lines, checked } = await run(renders({ [GOVDAO]: govdao(), [MEMBA]: memba() }), {
        file,
        pages: [GOVDAO, MEMBA],
      });
      expect(outcome).toEqual({ wrote: false, kind: last });
      expect(readFileSync(file, "utf8")).toBe(before);
      expect(checked).toEqual([]);
      expect(lines).toEqual([
        JSON.stringify({ event: "previews_skipped", error: first }),
        JSON.stringify({ event: "previews_skipped", error: last }),
        JSON.stringify({ event: "previews_failed", error: last }),
      ]);
    },
  );

  it("writes as ever after reads whose cause has no name: a reset or a bad certificate reached the host", async () => {
    const file = fresh();
    lastFile(file, [earlier(GOVDAO)]);
    const { outcome, lines } = await run(renders({ [GOVDAO]: fetchFault(), [MEMBA]: fetchFault() }), {
      file,
      pages: [GOVDAO, MEMBA],
    });
    expect(outcome).toEqual({ wrote: true });
    expect(read(file).previews).toEqual([earlier(GOVDAO)]);
    expect(lines.slice(0, 2)).toEqual([
      JSON.stringify({ event: "previews_skipped", error: "request" }),
      JSON.stringify({ event: "previews_skipped", error: "request" }),
    ]);
  });

  it("leaves no file at all after a first pass that reached nothing, as at the stack's start", async () => {
    const file = fresh();
    const { outcome } = await run(renders({ [GOVDAO]: unresolved() }), { file });
    expect(outcome).toEqual({ wrote: false, kind: "unresolved" });
    expect(readdirSync(dirname(file))).toEqual([]);
  });

  it("writes as ever once one read of the pass reached the chain, keeping the capture of a page that reached nothing", async () => {
    const file = fresh();
    lastFile(file, [earlier(GOVDAO)]);
    const { outcome } = await run(renders({ [GOVDAO]: refused(), [MEMBA]: page("Memba") }), {
      file,
      pages: [GOVDAO, MEMBA],
    });
    expect(outcome).toEqual({ wrote: true });
    expect(paths(file)).toEqual([GOVDAO, MEMBA]);
    expect(read(file).previews[0]).toEqual(earlier(GOVDAO));
  });

  it("takes a way out that refused the chain's host as an answer: the file written, the earlier captures kept", async () => {
    const file = fresh();
    lastFile(file, [earlier(GOVDAO)]);
    const { outcome, logged, lines } = await run(renders({ [GOVDAO]: proxyRefused() }), { file });
    expect(outcome).toEqual({ wrote: true });
    expect(read(file).previews).toEqual([earlier(GOVDAO)]);
    expect(lines[0]).toBe(JSON.stringify({ event: "previews_skipped", error: "proxy" }));
    expect(logged.map(({ event }) => event)).toEqual(["previews_skipped", "previews_written"]);
  });

  it("asks no page that is no realm's home, and each page once", async () => {
    const { chain } = await run(renders({ [GOVDAO]: page("GovDAO") }), {
      pages: [
        "gno.land/p/nt/avl/v0",
        "gno.land/r/gov/dao:37",
        "gno.land/r/gov/dao?page=2",
        "https://evil.example/r/x",
        "gno.land/r/gov/dao_test",
        "../../etc/passwd",
        `gno.land/r/${"a".repeat(250)}`,
        GOVDAO,
        GOVDAO,
      ],
    });
    expect(chain.asked.map(({ data }) => data)).toEqual([`${GOVDAO}:`]);
  });

  it("captures 32 pages a pass at most, the first by their paths", async () => {
    const all = Array.from({ length: 40 }, (_, i) => `gno.land/r/demo/p${String(i).padStart(3, "0")}`);
    const { chain, file } = await run({ render: () => "# a page\n" }, { pages: all.toReversed() });
    expect(chain.asked.map(({ data }) => data)).toEqual(all.slice(0, 32).map((path) => `${path}:`));
    expect(read(file).previews).toHaveLength(32);
  });

  it("logs no word of a page nor its path, whatever it held or however it failed: a fault is said by its kind", async () => {
    const hex = Buffer.from(`${GOVDAO}:`).toString("hex");
    const { lines } = await run(
      renders({
        [GOVDAO]: "# SECRET-WORD\n",
        [MEMBA]: new Error(`SECRET-WORD at https://rpc.onyx.testnets.gno.land/abci_query?data=0x${hex}`),
        "gno.land/r/a/b": new Response("SECRET-WORD {not json", { status: 200 }),
        "gno.land/r/a/c": new Response("SECRET-WORD", { status: 500 }),
      }),
      {
        pages: [GOVDAO, MEMBA, "gno.land/r/a/b", "gno.land/r/a/c"],
        check: () => Promise.resolve("hide"),
      },
    );
    const said = lines.join("\n");
    expect(said).not.toContain("SECRET");
    expect(said).not.toContain("gov/dao");
    expect(said).not.toContain("memba");
    expect(said).not.toContain(hex);
  });

  it("writes nothing once stopped, asks no page after, and keeps the last file whole", async () => {
    const file = fresh();
    lastFile(file, [earlier(GOVDAO)]);
    let stopped = false;
    const { outcome, chain } = await run(
      {
        render: (data) => {
          stopped = true;
          return page(data);
        },
      },
      { file, pages: [GOVDAO, MEMBA], isStopped: () => stopped },
    );
    expect(outcome).toEqual({ wrote: false, kind: "stopped" });
    expect(chain.asked.map(({ data }) => data)).toEqual([`${GOVDAO}:`]);
    expect(read(file).previews).toEqual([earlier(GOVDAO)]);
  });

  it("says a folder that refuses the file by its kind, and throws nothing", async () => {
    const { outcome, logged } = await run(renders({ [GOVDAO]: page("GovDAO") }), {
      file: join(dir, "missing-folder", "previews.json"),
    });
    expect(outcome).toEqual({ wrote: false, kind: "write" });
    expect(logged).toContainEqual({ event: "previews_failed", error: "write", ms: undefined });
  });
});

describe("checkOf, the moderation's word on a capture", () => {
  const CATEGORIES = [
    "harassment",
    "harassment/threatening",
    "hate",
    "hate/threatening",
    "illicit",
    "illicit/violent",
    "self-harm",
    "self-harm/instructions",
    "self-harm/intent",
    "sexual",
    "sexual/minors",
    "violence",
    "violence/graphic",
  ];
  const scores = (over: Record<string, number> = {}) =>
    Object.fromEntries(CATEGORIES.map((category) => [category, over[category] ?? 0]));
  const flags = (over: Record<string, boolean> = {}) =>
    Object.fromEntries(CATEGORIES.map((category) => [category, over[category] ?? false]));
  // Test data, built for every category: the provider's own answers go through its Zod (moderation/provider.ts).
  const answer = (flagged: Record<string, boolean>, scored: Record<string, number>): Answer => ({
    flagged,
    scores: scored,
  });

  it("passes what the provider does not flag, hides what it flags or scores past a threshold, and says unchecked when it could not read", async () => {
    expect(await checkOf(() => Promise.resolve(answer(flags(), scores())), {})("a")).toBe("pass");
    expect(await checkOf(() => Promise.resolve(answer(flags({ hate: true }), scores())), {})("a")).toBe("hide");
    expect(
      await checkOf(() => Promise.resolve(answer(flags(), scores({ violence: 0.95 }))), { violence: 0.9 })("a"),
    ).toBe("hide");
    expect(await checkOf(() => Promise.resolve("unchecked" as const), {})("a")).toBe("unchecked");
  });

  it("gives the provider the capture's text alone", async () => {
    const given: string[] = [];
    await checkOf((text) => {
      given.push(text);
      return Promise.resolve(answer(flags(), scores()));
    }, {})("# GovDAO\n");
    expect(given).toEqual(["# GovDAO\n"]);
  });

  it("says unchecked when the provider throws, never pass", async () => {
    expect(await checkOf(() => Promise.reject(new Error("down")), {})("a")).toBe("unchecked");
  });

  // What main.ts builds from the server's settings: OpenAI's key and the thresholds of MODERATION_THRESHOLDS (R10).
  it("asks OpenAI with the key the settings hold and decides by their thresholds", async () => {
    const asked: { url: string; init: RequestInit }[] = [];
    const openai =
      (scored: Record<string, number>): Send =>
      (url, init) => {
        asked.push({ url, init });
        return Promise.resolve(Response.json({ results: [{ categories: flags(), category_scores: scores(scored) }] }));
      };
    const key = { reveal: () => "sk-the-key-of-the-settings-0123456789" };
    const lenient = checkFor(
      { openaiKey: key, thresholds: {} },
      { log: () => undefined, send: openai({ violence: 0.95 }) },
    );
    expect(await lenient("# GovDAO\n")).toBe("pass");
    const strict = checkFor(
      { openaiKey: key, thresholds: { violence: 0.9 } },
      { log: () => undefined, send: openai({ violence: 0.95 }) },
    );
    expect(await strict("# GovDAO\n")).toBe("hide");
    expect(asked[0]?.url).toBe("https://api.openai.com/v1/moderations");
    expect(new Headers(asked[0]?.init.headers).get("authorization")).toBe(`Bearer ${key.reveal()}`);
    const body = asked[0]?.init.body;
    expect(JSON.parse(typeof body === "string" ? body : "null")).toEqual({
      model: "omni-moderation-latest",
      input: "# GovDAO\n",
    });
  });
});

describe("startPreviews", () => {
  it("refuses an RPC that is no public https address, and a universe id that is no plain name", () => {
    const base = { file: fresh(), log: () => undefined, pages: [GOVDAO], check: passes };
    for (const rpc of ["http://rpc.onyx.testnets.gno.land", "https://127.0.0.1:443", "https://user:pw@rpc.example"]) {
      expect(() => startPreviews({ ...base, universe: { id: "onyx", rpc } })).toThrow(RangeError);
    }
    expect(() => startPreviews({ ...base, universe: { id: "../x", rpc: RPC } })).toThrow(RangeError);
  });

  // Until a condition holds, or a failure after 10 s.
  const until = async (holds: () => boolean): Promise<void> => {
    const end = Date.now() + 10_000;
    while (!holds()) {
      if (Date.now() > end) throw new Error("waited 10 s");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };

  it("reads the pages again 15 s after a pass that reached nothing, not six hours later: Compose starts the server before its way out (F4872)", async () => {
    const waits = timerWaits();
    const file = fresh();
    const logged: unknown[][] = [];
    const job = startPreviews({
      file,
      log: (event, fields) => logged.push([event, fields]),
      universe: UNIVERSE,
      pages: [GOVDAO],
      check: passes,
      send: failingFirst(unresolved, fakeChain(renders({ [GOVDAO]: page("GovDAO") })).send),
    });
    try {
      await until(() => waits.includes(EVERY_MS));
    } finally {
      job.stop();
      vi.restoreAllMocks();
    }
    expect(waits).toEqual([15_000, EVERY_MS]);
    expect(paths(file)).toEqual([GOVDAO]);
    expect(logged.slice(0, 2)).toEqual([
      ["previews_skipped", { error: "unresolved" }],
      ["previews_failed", { error: "unresolved" }],
    ]);
    expect(logged.slice(2).map(([event]) => event)).toEqual(["previews_written"]);
  });

  it("asks a way out that never comes ever less often: 15 s, then 30 s", async () => {
    const waits = timerWaits();
    const job = startPreviews({
      file: fresh(),
      log: () => undefined,
      universe: UNIVERSE,
      pages: [GOVDAO],
      check: passes,
      send: () => Promise.reject(unresolved()),
    });
    try {
      await until(() => waits.length >= 2);
    } finally {
      job.stop();
      vi.restoreAllMocks();
    }
    expect(waits.slice(0, 2)).toEqual([15_000, 30_000]);
  });

  it("waits the whole interval after a pass that threw, and says so as internal", async () => {
    const waits = timerWaits();
    const logged: unknown[][] = [];
    const job = startPreviews({
      file: fresh(),
      log: (event, fields) => logged.push([event, fields]),
      universe: UNIVERSE,
      pages: [GOVDAO],
      check: passes,
      send: fakeChain(renders({ [GOVDAO]: page("GovDAO") })).send,
      now: () => {
        throw new Error("the clock broke");
      },
    });
    try {
      await until(() => waits.length > 0);
    } finally {
      job.stop();
      vi.restoreAllMocks();
    }
    expect(waits).toEqual([EVERY_MS]);
    expect(logged).toEqual([["previews_failed", { error: "internal" }]]);
  });

  it("runs a pass at start and again after each one ends, one at a time, and stops", async () => {
    const file = fresh();
    const chain = fakeChain(renders({ [GOVDAO]: page("GovDAO") }), { delayMs: 5 });
    const logged: string[] = [];
    const job = startPreviews({
      file,
      log: (event) => logged.push(event),
      universe: UNIVERSE,
      pages: [GOVDAO],
      check: passes,
      send: chain.send,
      everyMs: 10,
    });
    await until(() => logged.filter((event) => event === "previews_written").length >= 2);
    job.stop();
    const asked = chain.asked.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(chain.asked.length).toBeLessThanOrEqual(asked + 1);
    expect(chain.parallel()).toBe(1);
    expect(paths(file)).toEqual([GOVDAO]);
  });
});
