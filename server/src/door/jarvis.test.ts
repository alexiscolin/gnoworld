import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
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
const ANSWERED = () => ({ status: "answered", markdown: "The poll closes today.", buttons: [] });
const BUDGETS = () => ({ ask: 45, translate: 5 });
const live = () => new AbortController().signal;

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

  it("answers failed when jarvis answers an error", async () => {
    const jarvis = await fakeJarvis([json({ error: "internal" }, 500)]);
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "failed" });
  });

  it("answers down when nothing listens", async () => {
    const jarvis = await fakeJarvis([]);
    const server = servers.pop();
    server?.close();
    if (server !== undefined) await once(server, "close");
    const client = jarvisClient({ url: jarvis.url, timeoutMs: 5000 });
    expect(await client.ask(QUESTION(), live())).toEqual({ ok: false, error: "down" });
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
    expect(jarvis.heard.map(({ method, path }) => [method, path])).toEqual([["GET", "/budgets"]]);
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
    expect(await client.budgets()).toEqual({ ok: false, error: "down" });
  });
});
