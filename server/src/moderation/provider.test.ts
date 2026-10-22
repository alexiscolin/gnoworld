import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../log.ts";
import { moderationClient } from "./provider.ts";

// The answers OpenAI's own API description shows for POST /v1/moderations, byte for byte
// (github.com/openai/openai-openapi, branch manual_spec, 498c71dd, read 2026-10-22): omni-moderation-latest's,
// and an older model's without the illicit categories.
const OMNI = readFileSync(new URL("answers/omni.json", import.meta.url), "utf8");
const OLDER = readFileSync(new URL("answers/text-007.json", import.meta.url), "utf8");
const KEY = "sk-a-test-key-that-must-never-show-0123456789";
// Written out from the description's CreateModerationResponse, not taken from the code.
const THIRTEEN = [
  "hate",
  "hate/threatening",
  "harassment",
  "harassment/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
];

interface Call {
  url: string;
  init: RequestInit;
  ms: number;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = (answer: () => Promise<Response>) => {
  const calls: Call[] = [];
  const lines: string[] = [];
  const check = moderationClient({
    key: KEY,
    log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    send: (url, init, ms) => {
      calls.push({ url, init, ms });
      return answer();
    },
  });
  const events = () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{"));
  return { check, calls, events };
};
const ok = (body: string) => () => Promise.resolve(new Response(body, { status: 200 }));
const status =
  (code: number, body = "") =>
  () =>
    Promise.resolve(new Response(body, { status: code }));
// The omni answer with one category changed: dropped (undefined), or given another value.
const changed = (part: "categories" | "category_scores", category: string, value: unknown): string => {
  const answer = JSON.parse(OMNI) as { results: Record<string, Record<string, unknown>>[] };
  const result = answer.results[0];
  if (result === undefined) throw new Error("no result");
  result[part] = { ...result[part], [category]: value };
  return JSON.stringify(answer);
};

describe("the moderation client", () => {
  it("asks OpenAI's moderation endpoint with the model and the text alone, the key in its header", async () => {
    const { check, calls } = client(ok(OMNI));
    await check("I want to kill them.");
    expect(calls).toHaveLength(1);
    const [{ url, init, ms }] = calls as [Call];
    expect(url).toBe("https://api.openai.com/v1/moderations");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ model: "omni-moderation-latest", input: "I want to kill them." }));
    expect(ms).toBe(5000);
  });

  it("goes out through the server's one way out by default: a timeout, no redirect", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", (_: string, init: RequestInit) => {
      seen.push(init);
      return Promise.resolve(new Response(OMNI));
    });
    const check = moderationClient({ key: KEY, log: logger("a-pepper-of-forty-characters-0123456789", () => true) });
    expect(await check("x")).not.toBe("unchecked");
    expect([seen[0]?.redirect, seen[0]?.signal instanceof AbortSignal]).toEqual(["error", true]);
  });

  it("reads the docs' omni answer: each of the 13 categories' flag and score", async () => {
    const { check } = client(ok(OMNI));
    const answer = await check("x");
    if (answer === "unchecked") throw new Error("unchecked");
    expect(Object.keys(answer.scores).toSorted()).toEqual(THIRTEEN.toSorted());
    expect(Object.keys(answer.flagged).toSorted()).toEqual(THIRTEEN.toSorted());
    expect(answer.scores.violence).toBe(0.9999992735124786);
    expect(answer.flagged.violence).toBe(true);
    expect(answer.flagged["sexual/minors"]).toBe(false);
  });

  it.each([["illicit"], ["illicit/violent"]])(
    "reads %s's flag given as null, which the description allows, as not flagged",
    async (category) => {
      const { check, events } = client(ok(changed("categories", category, null)));
      const answer = await check("x");
      if (answer === "unchecked") throw new Error("unchecked");
      expect(answer.flagged[category as "illicit"]).toBe(false);
      expect(events()).toEqual([]);
    },
  );

  const SHAPES = THIRTEEN.flatMap((category) => [
    [`${category}'s flag missing`, changed("categories", category, undefined)],
    [`${category}'s score missing`, changed("category_scores", category, undefined)],
    [`${category}'s flag not a boolean`, changed("categories", category, "true")],
    [`${category}'s score not a number`, changed("category_scores", category, "0.5")],
    [`${category}'s score above 1`, changed("category_scores", category, 1.5)],
    [`${category}'s score below 0`, changed("category_scores", category, -0.1)],
  ]);

  // An answer of a shape it does not know raises the alert: the provider changed under us (decision 153).
  it.each([
    ["an answer missing categories, the older model's", OLDER],
    ["a category the client does not know, in the scores", changed("category_scores", "new/kind", 0.1)],
    ["a category the client does not know, in the flags", changed("categories", "new/kind", false)],
    ["text that is not JSON", "<html>bad gateway</html>"],
    ["a truncated answer", OMNI.slice(0, 300)],
    ["no result", JSON.stringify({ id: "x", model: "omni-moderation-latest", results: [] })],
    ["two results for one text", JSON.stringify({ ...(JSON.parse(OMNI) as object), results: [{}, {}] })],
    ...SHAPES,
  ])("counts %s as not checked, and raises the alert", async (_, body) => {
    const { check, events } = client(ok(body));
    expect(await check("x")).toBe("unchecked");
    expect(events()).toEqual(['{"event":"alert","error":"moderation_shape"}\n']);
  });

  it.each([
    ["a 401, a key revoked", status(401, `{"error":"Incorrect API key provided: ${KEY.slice(0, 12)}..."}`), "alert"],
    ["a 403", status(403), "alert"],
    ["a 400", status(400), "alert"],
    ["a 302", status(302), "alert"],
    ["a 500", status(500, "oops"), "down"],
    ["a 503", status(503), "down"],
    ["a 429, rate limited", status(429, "slow down"), "down"],
    ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError")), "down"],
    ["a network error", () => Promise.reject(new TypeError("fetch failed")), "down"],
  ])("counts %s as not checked, logging why, with neither the key nor the body", async (_, answer, kind) => {
    const { check, events } = client(answer);
    expect(await check("x")).toBe("unchecked");
    expect(events()).toEqual(
      kind === "alert"
        ? ['{"event":"alert","error":"moderation_refused"}\n']
        : ['{"event":"moderation_unchecked","error":"down"}\n'],
    );
    expect(events().join("")).not.toMatch(/sk-|Incorrect|oops|slow down/);
  });

  it("never lets its key into an error or a log line, nor the text it checks", async () => {
    const { check, events } = client(() => Promise.reject(new Error(`boom ${KEY}`)));
    await expect(check("a secret message")).resolves.toBe("unchecked");
    expect(events().join("")).not.toMatch(new RegExp(`${KEY}|a secret message`));
  });
});
