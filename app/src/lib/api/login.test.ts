import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loginApi, pageLoginApi, TIMEOUT_MS, type Fetcher } from "./login.ts";

const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const CHALLENGE = { nonce: "_-09azAZxxxxxxxxxxxxxx", text: "Sign in", expiresAt: "2026-10-25T10:00:00.000Z" };
const PROOF = {
  signed: {
    chain_id: "onyx-1",
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "0" },
    msgs: [{ type: "sign/MsgSignData", value: { signer: ADDRESS, data: "U2lnbiBpbg==" } }],
    memo: "",
  },
  signature: { pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "A".repeat(44) }, signature: "A".repeat(88) },
};
const VERIFY = { nonce: CHALLENGE.nonce, address: ADDRESS, proof: PROOF };

// A server that answers as told: a JSON value, or raw text with its own type, as a proxy's page comes.
interface Answer {
  status: number;
  json?: unknown;
  text?: string;
  type?: string;
}
// What a request carried: always a string here, its JSON.
const bodyOf = (init: RequestInit | undefined): string => (typeof init?.body === "string" ? init.body : "");
const server = (answer: Answer) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = answer.text ?? (answer.json === undefined ? null : JSON.stringify(answer.json));
    const headers = { "content-type": answer.type ?? "application/json" };
    return Promise.resolve(new Response(body, { status: answer.status, headers }));
  };
  return { api: loginApi(fetcher), sent };
};
const json = (status: number, value?: unknown): Answer => ({ status, json: value });

// Each call, with an answer it takes as success, so a table can run them all.
const CALLS = [
  {
    name: "challenge",
    url: "/api/login/challenge",
    method: "POST",
    ok: json(200, CHALLENGE),
    run: (api: ReturnType<typeof loginApi>) => api.challenge("onyx-1"),
  },
  {
    name: "verify",
    url: "/api/login/verify",
    method: "POST",
    ok: json(200, { address: ADDRESS }),
    run: (api: ReturnType<typeof loginApi>) => api.verify(VERIFY),
  },
  {
    name: "ticket",
    url: "/api/login/ticket",
    method: "POST",
    ok: json(200, { ticket: "t".repeat(43) }),
    run: (api: ReturnType<typeof loginApi>) => api.ticket(),
  },
  {
    name: "me",
    url: "/api/login/me",
    method: "GET",
    ok: json(200, { address: ADDRESS }),
    run: (api: ReturnType<typeof loginApi>) => api.me(),
  },
  {
    name: "logout",
    url: "/api/login/logout",
    method: "POST",
    ok: { status: 204 },
    run: (api: ReturnType<typeof loginApi>) => api.logout(),
  },
] as const;
const POSTS = CALLS.filter((call) => call.method === "POST");

afterEach(() => {
  vi.useRealTimers();
});

describe("the login's calls to the server", () => {
  it.each(CALLS)(
    "$name: its path and method, the session's cookie sent to this site alone, no redirect followed",
    async (call) => {
      const { api, sent } = server(call.ok);
      expect(await call.run(api)).toMatchObject({ ok: true });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.url).toBe(call.url);
      expect(sent[0]?.init).toMatchObject({ method: call.method, credentials: "same-origin", redirect: "error" });
    },
  );

  it.each(POSTS)("$name: a JSON body, said so, as the server's guard wants (415 otherwise)", async (call) => {
    const { api, sent } = server(call.ok);
    await call.run(api);
    expect(new Headers(sent[0]?.init.headers).get("content-type")).toBe("application/json");
    expect(typeof sent[0]?.init.body).toBe("string");
  });

  it("asks a challenge for the chain Adena is on", async () => {
    const { api, sent } = server(json(200, CHALLENGE));
    expect(await api.challenge("onyx-1")).toEqual({ ok: true, value: CHALLENGE });
    expect(JSON.parse(bodyOf(sent[0]?.init))).toEqual({ chainId: "onyx-1" });
  });

  it("posts the proof with its nonce and address, and reads the account logged in", async () => {
    const { api, sent } = server(json(200, { address: ADDRESS }));
    expect(await api.verify(VERIFY)).toEqual({ ok: true, value: { address: ADDRESS } });
    expect(JSON.parse(bodyOf(sent[0]?.init))).toEqual(VERIFY);
  });

  it("refuses a login the server says is another account's", async () => {
    expect(await server(json(200, { address: OTHER })).api.verify(VERIFY)).toEqual({ ok: false, reason: "malformed" });
  });

  it("asks a ticket for Ergo with an empty object", async () => {
    const { api, sent } = server(json(200, { ticket: "t".repeat(43) }));
    expect(await api.ticket()).toEqual({ ok: true, value: { ticket: "t".repeat(43) } });
    expect(sent[0]?.init.body).toBe("{}");
  });

  it("says a ticket needs a login again when the session is gone (401)", async () => {
    expect(await server(json(401, { error: "unauthenticated" })).api.ticket()).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("reads who is logged in, or nobody", async () => {
    expect(await server(json(200, { address: ADDRESS })).api.me()).toEqual({ ok: true, value: { address: ADDRESS } });
    expect(await server(json(200, { address: null })).api.me()).toEqual({ ok: true, value: { address: null } });
  });

  it.each([
    [json(500, { error: "internal" }), "internal"],
    [{ status: 502 }, "unavailable"],
    [json(429, { error: "too_many" }), "too_many"],
    [json(401, { error: "unauthenticated" }), "unauthenticated"],
    [{ status: 401, text: "<html>401</html>", type: "text/html" }, "malformed"],
  ])("never takes a failure of me for nobody: %j gives %s", async (answer, reason) => {
    expect(await server(answer).api.me()).toEqual({ ok: false, reason });
  });

  it("logs out, the server answering with no body", async () => {
    expect(await server({ status: 204 }).api.logout()).toEqual({ ok: true, value: undefined });
    expect(await server(json(500, { error: "internal" })).api.logout()).toEqual({ ok: false, reason: "internal" });
  });

  // Every code the server answers (packages/schemas' ApiError), on every POST.
  const CODES: [number, string][] = [
    [400, "refused"],
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not_found"],
    [413, "too_large"],
    [415, "unsupported"],
    [429, "too_many"],
    [500, "internal"],
    [503, "not_ready"],
  ];
  it.each(POSTS.flatMap((call) => CODES.map(([status, code]) => ({ name: call.name, status, code, run: call.run }))))(
    "$name: a $status answering $code gives that reason",
    async ({ status, code, run }) => {
      expect(await run(server(json(status, { error: code })).api)).toEqual({ ok: false, reason: code });
    },
  );

  it.each([
    [{ status: 502, text: "<html>bad gateway</html>", type: "text/html" }, "unavailable"],
    [{ status: 503 }, "unavailable"],
    [{ status: 429, text: "<html>429</html>", type: "text/html" }, "too_many"],
    [{ status: 404, text: "<html>404</html>", type: "text/html" }, "malformed"],
    [{ status: 413, text: "<html>413</html>", type: "text/html" }, "malformed"],
    [json(400, { error: "teapot" }), "malformed"],
    [{ status: 307 }, "malformed"],
  ])("gives a reason to an answer with no code of the server's: %j gives %s", async (answer, reason) => {
    expect(await server(answer).api.challenge("onyx-1")).toEqual({ ok: false, reason });
  });

  it.each([
    ["a page, not JSON", { status: 200, text: "<html>", type: "text/html" }],
    ["JSON cut short", { status: 200, text: '{"nonce":' }],
    ["an empty answer", { status: 200 }],
    ["the server's error with a 200", json(200, { error: "internal" })],
    ["a challenge whose nonce is no nonce", json(200, { ...CHALLENGE, nonce: "short" })],
  ])("refuses %s as a challenge", async (_, answer) => {
    expect(await server(answer).api.challenge("onyx-1")).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    ["me", json(200, { address: "cosmos1x" }), (api: ReturnType<typeof loginApi>) => api.me()],
    ["ticket", json(200, {}), (api: ReturnType<typeof loginApi>) => api.ticket()],
    ["ticket", json(200, { ticket: 5 }), (api: ReturnType<typeof loginApi>) => api.ticket()],
    ["verify", json(200, { address: "cosmos1x" }), (api: ReturnType<typeof loginApi>) => api.verify(VERIFY)],
    ["verify", { status: 204 }, (api: ReturnType<typeof loginApi>) => api.verify(VERIFY)],
  ])("refuses an answer of %s of another shape: %j", async (_, answer, run) => {
    expect(await run(server(answer).api)).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    ["a rejection", () => Promise.reject(new TypeError("Failed to fetch https://x/?nonce=abc"))],
    ["a refused redirect", () => Promise.reject(new TypeError("redirect mode is error"))],
    [
      "a throw before any promise",
      () => {
        throw new Error("sync");
      },
    ],
  ])("says the network failed on %s, and nothing more", async (_, fetcher) => {
    expect(await loginApi(fetcher).me()).toEqual({ ok: false, reason: "network" });
  });

  it("says the network failed when the answer's body breaks off", async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"address":'));
        controller.error(new TypeError("connection reset"));
      },
    });
    const api = loginApi(() => Promise.resolve(new Response(broken, { status: 200 })));
    expect(await api.me()).toEqual({ ok: false, reason: "network" });
  });

  describe("its time limit", () => {
    // A server that never answers, or answers its headers and then nothing.
    const silent: Fetcher = (_url, init = {}) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    const stalling: Fetcher = (_url, init = {}) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init.signal?.addEventListener("abort", () => {
                controller.error(new Error("aborted"));
              });
            },
          }),
          { status: 200 },
        ),
      );

    it("is ten seconds, as the server's own", () => {
      expect(TIMEOUT_MS).toBe(10_000);
    });

    it.each([
      ["a server that never answers", silent],
      ["an answer whose body never ends", stalling],
    ])("gives up on %s at its time, not before", async (_, fetcher) => {
      vi.useFakeTimers();
      let done: unknown;
      const pending = loginApi(fetcher)
        .me()
        .then((result) => {
          done = result;
        });
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
      expect(done).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(done).toEqual({ ok: false, reason: "network" });
    });

    it("leaves no timer behind, whatever the answer", async () => {
      vi.useFakeTimers();
      await server(json(200, { address: ADDRESS })).api.me();
      await server(json(500, { error: "internal" })).api.me();
      await loginApi(() => Promise.reject(new TypeError("down"))).me();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("times each call apart: one that timed out does not stop the next", async () => {
      vi.useFakeTimers();
      let answer = false;
      const api = loginApi((url, init = {}) =>
        answer
          ? Promise.resolve(new Response(JSON.stringify({ address: ADDRESS }), { status: 200 }))
          : silent(url, init),
      );
      const first = api.me();
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
      expect(await first).toEqual({ ok: false, reason: "network" });
      answer = true;
      expect(await api.me()).toEqual({ ok: true, value: { address: ADDRESS } });
    });
  });
});

describe("pageLoginApi", () => {
  it("calls the page's own fetch, on this site's paths", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      seen.push(url);
      return Promise.resolve(new Response(JSON.stringify({ address: ADDRESS }), { status: 200 }));
    });
    expect(await pageLoginApi().me()).toEqual({ ok: true, value: { address: ADDRESS } });
    expect(seen).toEqual(["/api/login/me"]);
    vi.unstubAllGlobals();
  });
});
