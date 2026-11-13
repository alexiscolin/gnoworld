import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { JARVIS_KEY_HEADER } from "@gnoworld/schemas";
import { Secret } from "@gnoworld/service/settings";
import { jarvisClient } from "./jarvis.ts";

// 10g (D42, D94): the door's one call to jarvis a question, on the network the two share, tested against a fake jarvis.
interface Heard {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}
type Reply = (res: ServerResponse) => void;

const servers: ReturnType<typeof createServer>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

// A fake jarvis: what it heard, and each request answered by the next reply.
const fakeJarvis = async (replies: Reply[]) => {
  const heard: Heard[] = [];
  const closed: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      heard.push({ method: req.method ?? "", path: req.url ?? "", headers: req.headers, body });
      res.on("close", () => closed.push(req.url ?? ""));
      const reply = replies.shift();
      if (reply === undefined) res.writeHead(500).end();
      else reply(res);
    });
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${String(port)}`, heard, closed };
};
const json =
  (value: unknown, status = 200): Reply =>
  (res) => {
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
  };
const never: Reply = () => undefined;

const QUESTION = () => ({
  question: "What is new in this room?",
  room: "#bubble",
  lines: [{ speaker: 1, text: "the poll closes today", time: "2026-11-04T12:00:00.000Z" }],
});
const ANSWERED = () => ({ status: "answered", markdown: "The poll closes today.", buttons: [], cost: 1234 });
const BUDGETS = () => ({ ask: 45, translate: 5 });
const live = () => new AbortController().signal;

// 10u-g2: the door proves itself to jarvis with its key, in one header of every request.
describe("the door's key", () => {
  const KEY = `door-key-${"k".repeat(40)}`;
  const BUDGET = { budget: "ask" as const, dollars: 3 };

  it("sends the key with every call: a question, a translation, a digest, the budgets and a change of one", async () => {
    const jarvis = await fakeJarvis(Array.from({ length: 5 }, () => json({})));
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000, key: new Secret(KEY) });
    await client.ask(QUESTION(), live());
    await client.translate({ text: "The vote closes.", language: "fr" }, live());
    await client.digest({ universe: "onyx", realm: "gno.land/r/demo/poll" }, live());
    await client.budgets();
    await client.setBudget(BUDGET);
    expect(jarvis.heard.map(({ headers }) => headers[JARVIS_KEY_HEADER])).toEqual([KEY, KEY, KEY, KEY, KEY]);
  });

  it("sends none when it has none", async () => {
    const jarvis = await fakeJarvis([json({})]);
    await jarvisClient({ url: jarvis.url, timeoutMs: 5000 }).budgets();
    expect(jarvis.heard[0]?.headers[JARVIS_KEY_HEADER]).toBeUndefined();
  });

  it("answers failed for a jarvis that refuses the key with 401, never repeating it", async () => {
    const jarvis = await fakeJarvis([json({ error: "unauthenticated" }, 401)]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000, key: new Secret(KEY) });
    expect(await client.budgets()).toEqual({ ok: false, error: "failed" });
  });
});

describe("asking jarvis", () => {
  it("posts the question as JSON to /ask, with no cookie, no session and nothing of the asker's", async () => {
    const jarvis = await fakeJarvis([json(ANSWERED())]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: true, answer: ANSWERED() });
    expect(jarvis.heard).toHaveLength(1);
    const [heard] = jarvis.heard;
    expect([heard?.method, heard?.path, heard?.headers["content-type"]]).toEqual(["POST", "/ask", "application/json"]);
    expect(JSON.parse(heard?.body ?? "")).toEqual(QUESTION());
    expect(Object.keys(heard?.headers ?? {})).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(cookie|authorization|x-real-ip|x-forwarded-for)$/)]),
    );
  });

  it("passes on spent, the day's budget gone", async () => {
    const jarvis = await fakeJarvis([json({ status: "spent" })]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: true, answer: { status: "spent" } });
  });

  it("refuses an answer that fails the client's schema, or is no JSON, as shape", async () => {
    const answers: Reply[] = [
      json({ ...ANSWERED(), html: "<b>hi</b>" }),
      json({ status: "answered", markdown: "", buttons: [] }),
      json({ ...ANSWERED(), buttons: [{ type: "fly", label: "Away", place: "https://evil.test" }] }),
      (res) => res.writeHead(200).end("<html>"),
    ];
    const jarvis = await fakeJarvis([...answers]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    const asked = await Promise.all(answers.map(() => client.ask(QUESTION(), live())));
    expect(asked).toEqual(answers.map(() => ({ ok: false, error: "shape" })));
  });

  it("reads an answer up to 1 MiB, and refuses one a byte past it as shape", async () => {
    // A good answer padded with JSON's own blanks, so only its size can refuse it.
    const padded = (bytes: number): Reply => {
      const body = JSON.stringify(ANSWERED());
      return (res) => res.writeHead(200).end(body + " ".repeat(bytes - Buffer.byteLength(body)));
    };
    const jarvis = await fakeJarvis([padded(1024 * 1024), padded(1024 * 1024 + 1)]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: true, answer: ANSWERED() });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "shape" });
  });

  it("reads a declined question with its cost, and refuses an answer with no cost as the wrong shape (D13985)", async () => {
    const jarvis = await fakeJarvis([
      json({ status: "declined", cost: 77 }),
      json({ status: "failed", cost: 5 }),
      json({ status: "spent", cost: 9 }),
      json({ status: "answered", markdown: "x", buttons: [] }),
      json({ status: "declined" }),
      json({ status: "paused" }),
      json({ status: "answered", markdown: "x", buttons: [], cost: -1 }),
    ]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: true, answer: { status: "declined", cost: 77 } });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: true, answer: { status: "failed", cost: 5 } });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: true, answer: { status: "spent", cost: 9 } });
    for (let at = 0; at < 4; at += 1)
      expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "shape" });
  });

  it("answers failed when jarvis answers an error", async () => {
    const jarvis = await fakeJarvis([json({ error: "internal" }, 500)]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "failed" });
  });

  it("answers a jarvis that answers 503 not ready as down, and 504 as slow, never as its failure (F5314)", async () => {
    const jarvis = await fakeJarvis([json({ error: "not_ready" }, 503), json({ error: "not_ready" }, 504)]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "down" });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "slow" });
  });

  it("answers lost when nothing listens, a thrown error that is no timeout, apart from a 503 down", async () => {
    const jarvis = await fakeJarvis([]);
    const server = servers.pop();
    server?.close();
    if (server !== undefined) await once(server, "close");
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "lost" });
  });

  it("answers slow past its timeout, and never hangs", async () => {
    const jarvis = await fakeJarvis([never]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 100 });
    const started = performance.now();
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "slow" });
    expect(performance.now() - started).toBeLessThan(2000);
    await expect.poll(() => jarvis.closed).toEqual(["/ask"]);
  });

  it("answers slow when the answer's body stalls once its headers came, and closes the call", async () => {
    const half: Reply = (res) => {
      res.writeHead(200, { "content-type": "application/json" }).write('{"status"');
    };
    const jarvis = await fakeJarvis([half]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 200 });
    const started = performance.now();
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "slow" });
    expect(performance.now() - started).toBeLessThan(2000);
    await expect.poll(() => jarvis.closed).toEqual(["/ask"]);
  });

  it("answers gone when the request that asked leaves while the body comes", async () => {
    const half: Reply = (res) => {
      res.writeHead(200, { "content-type": "application/json" }).write('{"status"');
    };
    const jarvis = await fakeJarvis([half]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 60_000 });
    const request = new AbortController();
    const asked = client.ask(QUESTION(), request.signal);
    await expect.poll(() => jarvis.heard).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    request.abort();
    expect(await asked).toEqual({ ok: false, error: "gone" });
    await expect.poll(() => jarvis.closed).toEqual(["/ask"]);
  });

  it("asks nothing for a request already gone", async () => {
    const jarvis = await fakeJarvis([json(ANSWERED())]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), AbortSignal.abort())).toEqual({ ok: false, error: "gone" });
    expect(jarvis.heard).toEqual([]);
  });

  it("is aborted with the request that asked: jarvis sees the call close", async () => {
    const jarvis = await fakeJarvis([never]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 60_000 });
    const request = new AbortController();
    const asked = client.ask(QUESTION(), request.signal);
    await expect.poll(() => jarvis.heard).toHaveLength(1);
    request.abort();
    expect(await asked).toEqual({ ok: false, error: "gone" });
    await expect.poll(() => jarvis.closed).toEqual(["/ask"]);
  });
});

describe("jarvis's budgets", () => {
  it("are read with GET /budgets", async () => {
    const jarvis = await fakeJarvis([json(BUDGETS())]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.budgets()).toEqual({ ok: true, budgets: BUDGETS() });
    expect(jarvis.heard.map(({ method, path, headers }) => [method, path, headers.accept])).toEqual([
      ["GET", "/budgets", "application/json"],
    ]);
  });

  it("are changed with POST /budgets, one budget in whole dollars, jarvis answering both", async () => {
    const jarvis = await fakeJarvis([json({ ask: 30, translate: 5 })]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.setBudget({ budget: "ask", dollars: 30 })).toEqual({
      ok: true,
      budgets: { ask: 30, translate: 5 },
    });
    const [heard] = jarvis.heard;
    expect([heard?.method, heard?.path, heard?.headers["content-type"]]).toEqual([
      "POST",
      "/budgets",
      "application/json",
    ]);
    expect(JSON.parse(heard?.body ?? "")).toEqual({ budget: "ask", dollars: 30 });
  });

  it("fail as the question does: an error, an answer of another shape, nothing listening", async () => {
    const jarvis = await fakeJarvis([
      json({ error: "internal" }, 500),
      json({ ask: 45 }),
      json({ ask: 0, translate: 5 }),
    ]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.budgets()).toEqual({ ok: false, error: "failed" });
    expect(await client.budgets()).toEqual({ ok: false, error: "shape" });
    expect(await client.setBudget({ budget: "translate", dollars: 5 })).toEqual({ ok: false, error: "shape" });
    const server = servers.pop();
    server?.closeAllConnections();
    server?.close();
    if (server !== undefined) await once(server, "close");
    expect(await client.budgets()).toEqual({ ok: false, error: "lost" });
  });
});

describe("a translation and a digest from jarvis (10k)", () => {
  const TRANSLATE = () => ({ text: "The vote closes at block 1,204.", language: "fr" as const });
  const DIGEST = () => ({ universe: "onyx", realm: "gno.land/r/demo/poll" });
  const MADE = () => ({
    status: "digest",
    digest: { blocks: [{ type: "facts", facts: [{ label: "Members", value: "1,204" }] }] },
    proposal: null,
    height: 1204,
    made: true,
  });

  it("posts a line's text and its language to /translate, and reads the translation through its schema", async () => {
    const translated = { status: "translated", text: "Le vote se termine au bloc 1 204." };
    const jarvis = await fakeJarvis([json(translated), json({ status: "original" }), json({ status: "translated" })]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.translate(TRANSLATE(), live())).toEqual({ ok: true, answer: translated });
    expect(await client.translate(TRANSLATE(), live())).toEqual({ ok: true, answer: { status: "original" } });
    expect(await client.translate(TRANSLATE(), live())).toEqual({ ok: false, error: "shape" });
    expect(jarvis.heard.map(({ method, path }) => [method, path])[0]).toEqual(["POST", "/translate"]);
    expect(JSON.parse(jarvis.heard[0]?.body ?? "")).toEqual(TRANSLATE());
  });

  it("posts a realm and its universe to /digest, and reads the digest through its schema", async () => {
    const jarvis = await fakeJarvis([json(MADE()), json({ ...MADE(), height: 0 }), json({ error: "internal" }, 502)]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.digest(DIGEST(), live())).toEqual({ ok: true, answer: MADE() });
    expect(await client.digest(DIGEST(), live())).toEqual({ ok: false, error: "shape" });
    expect(await client.digest(DIGEST(), live())).toEqual({ ok: false, error: "failed" });
    expect(jarvis.heard.map(({ method, path }) => [method, path])[0]).toEqual(["POST", "/digest"]);
    expect(JSON.parse(jarvis.heard[0]?.body ?? "")).toEqual(DIGEST());
  });

  it("answers each slow past its time, and down when nothing answers (red pass, R8)", async () => {
    const jarvis = await fakeJarvis([never, never]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 200 });
    expect(await client.translate(TRANSLATE(), live())).toEqual({ ok: false, error: "slow" });
    expect(await client.digest(DIGEST(), live())).toEqual({ ok: false, error: "slow" });
    const server = servers.pop();
    server?.closeAllConnections();
    server?.close();
    if (server !== undefined) await once(server, "close");
    expect(await client.translate(TRANSLATE(), live())).toEqual({ ok: false, error: "lost" });
    expect(await client.digest(DIGEST(), live())).toEqual({ ok: false, error: "lost" });
  });

  it("stops each with the request that asked", async () => {
    const jarvis = await fakeJarvis([never, never]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 60_000 });
    const [one, two] = [new AbortController(), new AbortController()];
    const translating = client.translate(TRANSLATE(), one.signal);
    const digesting = client.digest(DIGEST(), two.signal);
    await expect.poll(() => jarvis.heard, { timeout: 30_000 }).toHaveLength(2);
    one.abort();
    two.abort();
    expect([await translating, await digesting]).toEqual([
      { ok: false, error: "gone" },
      { ok: false, error: "gone" },
    ]);
  });

  it("reads jarvis's refusal of a request as refused, never as its failure (the review's V3)", async () => {
    const jarvis = await fakeJarvis([json({ error: "refused" }, 400), json({ error: "refused" }, 400)]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.digest({ universe: "mars", realm: "gno.land/r/demo/poll" }, live())).toEqual({
      ok: false,
      error: "refused",
    });
    expect(await client.translate(TRANSLATE(), live())).toEqual({ ok: false, error: "refused" });
  });
});
