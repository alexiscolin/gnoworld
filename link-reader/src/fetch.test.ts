import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLimited, LIMITS, Refused, USER_AGENT } from "./fetch.ts";
import type { Deps, Reply, Request } from "./fetch.ts";

const HTML = { "content-type": "text/html; charset=utf-8" };
const PUBLIC = "93.184.216.34";
const enc = (text: string) => new TextEncoder().encode(text);

async function* chunks(...parts: (string | Uint8Array)[]) {
  await Promise.resolve();
  for (const part of parts) yield typeof part === "string" ? enc(part) : part;
}
const reply = (status: number, headers: Record<string, string>, ...parts: (string | Uint8Array)[]): Reply => ({
  status,
  headers,
  body: chunks(...parts),
});
const redirect = (location: string, status = 302): Reply => reply(status, { location });

/** Transports that answer in order (the last repeats), recording each request, and a lookup that answers `address` or what `lookups` says. */
function stack(replies: Reply[], lookup: Deps["lookup"] | null = () => Promise.resolve([PUBLIC])) {
  const requests: Request[] = [];
  const transport = vi.fn((request: Request) => {
    requests.push(request);
    const next = replies[Math.min(requests.length, replies.length) - 1];
    if (next === undefined) throw new Error("no reply planned");
    return Promise.resolve(next);
  });
  const lookups = lookup === null ? undefined : vi.fn(lookup);
  return { deps: { lookup: lookups, transport } satisfies Deps, requests, transport, lookups };
}
const kindOf = async (promise: Promise<unknown>) => {
  const caught: unknown = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(Refused);
  return (caught as Refused).kind;
};
const PAGE = "https://example.com/post";

afterEach(() => {
  vi.useRealTimers();
});

describe("what is asked and of whom", () => {
  it("connects to the address the guard checked, and sends the same few headers every time", async () => {
    const { deps, requests } = stack([reply(200, HTML, "<html></html>")]);
    await fetchLimited(PAGE, "page", deps);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.address).toBe(PUBLIC);
    expect(requests[0]?.url.href).toBe(PAGE);
    // Exactly these: no cookie, no Referer, no Authorization, no Accept-Language, no content encoding to bomb us with.
    expect(requests[0]?.headers).toEqual({
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-encoding": "identity",
    });
  });

  it("asks a picture for pictures, with the same few headers", async () => {
    const { deps, requests } = stack([reply(200, { "content-type": "image/png" }, "x")]);
    await fetchLimited("https://cdn.example.com/a.png", "picture", deps);
    expect(requests[0]?.headers).toEqual({
      "user-agent": USER_AGENT,
      accept: "image/jpeg,image/png",
      "accept-encoding": "identity",
    });
  });

  it("hands over the address undefined behind a proxy, which resolves and refuses by itself", async () => {
    const { deps, requests } = stack([reply(200, HTML, "x")], null);
    await fetchLimited(PAGE, "page", deps);
    expect(requests[0]?.address).toBeUndefined();
  });

  it("applies the URL rule to what it is given, before any lookup or connection", async () => {
    const { deps, transport, lookups } = stack([reply(200, HTML, "x")]);
    expect(await kindOf(fetchLimited("http://example.com/", "page", deps))).toBe("url");
    expect(await kindOf(fetchLimited("https://127.0.0.1/", "page", deps))).toBe("url");
    expect(await kindOf(fetchLimited("https://example.com:8443/", "picture", deps))).toBe("url");
    expect(lookups).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("DNS, checked when the connection is made", () => {
  it("refuses a name that resolves to a private address, and never connects", async () => {
    const { deps, transport } = stack([reply(200, HTML, "x")], () => Promise.resolve(["10.0.0.1"]));
    expect(await kindOf(fetchLimited("https://10.0.0.1.nip.io/", "page", deps))).toBe("private");
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([["127.0.0.1"], ["169.254.169.254"], ["::1"], ["fc00::1"], ["100.64.0.1"], ["::ffff:10.0.0.1"]])(
    "refuses a name that resolves to %s",
    async (address) => {
      const { deps, transport } = stack([reply(200, HTML, "x")], () => Promise.resolve([address]));
      expect(await kindOf(fetchLimited("https://localtest.me/", "page", deps))).toBe("private");
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it("refuses a name with one private answer among public ones", async () => {
    const { deps, transport } = stack([reply(200, HTML, "x")], () => Promise.resolve([PUBLIC, "10.0.0.1"]));
    expect(await kindOf(fetchLimited(PAGE, "page", deps))).toBe("private");
    expect(transport).not.toHaveBeenCalled();
  });

  it("refuses a name that does not resolve, or resolves to nothing", async () => {
    const down = stack([reply(200, HTML, "x")], () => Promise.reject(new Error("ENOTFOUND")));
    expect(await kindOf(fetchLimited(PAGE, "page", down.deps))).toBe("dns");
    const empty = stack([reply(200, HTML, "x")], () => Promise.resolve([]));
    expect(await kindOf(fetchLimited(PAGE, "page", empty.deps))).toBe("dns");
    expect(down.transport).not.toHaveBeenCalled();
    expect(empty.transport).not.toHaveBeenCalled();
  });

  it("asks again at every hop, so a name that turns private after the first answer is refused (DNS rebinding)", async () => {
    let asked = 0;
    const { deps, transport, lookups } = stack([redirect("/next"), reply(200, HTML, "x")], () =>
      Promise.resolve(++asked === 1 ? [PUBLIC] : ["10.0.0.1"]),
    );
    expect(await kindOf(fetchLimited(PAGE, "page", deps))).toBe("private");
    expect(lookups).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe("redirects", () => {
  it("follows a relative one and an absolute one on the same host, each to the address checked", async () => {
    const { deps, requests } = stack([
      redirect("/a", 301),
      redirect("https://example.com/b", 308),
      reply(200, HTML, "<html></html>"),
    ]);
    const got = await fetchLimited(PAGE, "page", deps);
    expect(requests.map((request) => request.url.href)).toEqual([
      PAGE,
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(got.url.href).toBe("https://example.com/b");
  });

  it("follows three and refuses a fourth", async () => {
    const three = stack([redirect("/1"), redirect("/2"), redirect("/3"), reply(200, HTML, "x")]);
    await expect(fetchLimited(PAGE, "page", three.deps)).resolves.toBeDefined();
    const four = stack([redirect("/1"), redirect("/2"), redirect("/3"), redirect("/4"), reply(200, HTML, "x")]);
    expect(await kindOf(fetchLimited(PAGE, "page", four.deps))).toBe("redirect");
    expect(four.transport).toHaveBeenCalledTimes(4);
  });

  it("refuses an endless loop", async () => {
    const { deps } = stack([redirect("/loop")]);
    expect(await kindOf(fetchLimited(PAGE, "page", deps))).toBe("redirect");
  });

  it.each([
    ["another host", "https://other.example.org/"],
    ["a subdomain", "https://www.example.com/"],
    ["a downgrade to http", "http://example.com/"],
    ["another port", "https://example.com:8443/"],
    ["an IP literal", "https://93.184.216.34/"],
    ["the metadata address", "http://169.254.169.254/latest/meta-data/"],
    ["userinfo", "https://user@example.com/"],
    ["javascript", "javascript:alert(1)"],
    ["a protocol-relative other host", "//other.example.org/"],
    ["no Location at all", ""],
  ])("refuses a redirect to %s, and makes no second request", async (_name, location) => {
    const { deps, transport } = stack([location === "" ? reply(302, {}) : redirect(location), reply(200, HTML, "x")]);
    expect(await kindOf(fetchLimited(PAGE, "page", deps))).toBe("redirect");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("holds a picture's redirects to the picture's own host", async () => {
    const { deps } = stack([redirect("https://other.example.org/a.png")]);
    expect(await kindOf(fetchLimited("https://cdn.example.com/a.png", "picture", deps))).toBe("redirect");
  });
});

describe("what a reply may be", () => {
  it.each([[404], [403], [500], [204], [206], [304], [100]])("refuses a status %i", async (status) => {
    const { deps } = stack([reply(status, HTML, "<html></html>")]);
    expect(await kindOf(fetchLimited(PAGE, "page", deps))).toBe("status");
  });

  it.each([["text/html"], ["text/html; charset=iso-8859-1"], ["TEXT/HTML"], ["application/xhtml+xml"]])(
    "takes a page of type %s",
    async (type) => {
      const { deps } = stack([reply(200, { "content-type": type }, "<html></html>")]);
      await expect(fetchLimited(PAGE, "page", deps)).resolves.toBeDefined();
    },
  );

  it.each([["text/plain"], ["application/json"], ["image/png"], ["application/octet-stream"], [""]])(
    "refuses a page of type %j",
    async (type) => {
      const { deps } = stack([reply(200, type === "" ? {} : { "content-type": type }, "<html></html>")]);
      expect(await kindOf(fetchLimited(PAGE, "page", deps))).toBe("type");
    },
  );

  it("refuses a reply with a content encoding, which would be decoded past the byte cap", async () => {
    const { deps } = stack([reply(200, { ...HTML, "content-encoding": "gzip" }, "x")]);
    expect(await kindOf(fetchLimited(PAGE, "page", deps))).toBe("type");
    const identity = stack([reply(200, { ...HTML, "content-encoding": "identity" }, "x")]);
    await expect(fetchLimited(PAGE, "page", identity.deps)).resolves.toBeDefined();
  });

  it("takes a picture whatever its declared type: its bytes decide, later", async () => {
    const { deps } = stack([reply(200, { "content-type": "text/html" }, "bytes")]);
    await expect(fetchLimited("https://cdn.example.com/a.jpg", "picture", deps)).resolves.toMatchObject({
      bytes: enc("bytes"),
    });
  });
});

describe("the byte caps", () => {
  async function* endless(size: number, seen: { count: number }) {
    await Promise.resolve();
    for (;;) {
      seen.count++;
      yield new Uint8Array(size).fill(97);
    }
  }

  it("stops a page at its cap when there is no length, and answers what it read", async () => {
    const seen = { count: 0 };
    const { deps } = stack([{ status: 200, headers: HTML, body: endless(64 * 1024, seen) }]);
    const got = await fetchLimited(PAGE, "page", deps);
    expect(got.bytes.length).toBeLessThanOrEqual(LIMITS.page.bytes);
    expect(got.bytes.length).toBeGreaterThan(0);
    expect(seen.count).toBeLessThanOrEqual(LIMITS.page.bytes / (64 * 1024) + 1);
  });

  it("stops a page at the end of its head: nothing past `</head>` is read, whatever follows", async () => {
    const seen = { count: 0 };
    async function* body() {
      yield enc("<html><head><title>x</title></head><body>");
      yield* endless(64 * 1024, seen);
    }
    const { deps } = stack([{ status: 200, headers: HTML, body: body() }]);
    const got = await fetchLimited(PAGE, "page", deps);
    expect(new TextDecoder().decode(got.bytes)).toContain("</head>");
    expect(seen.count).toBeLessThanOrEqual(1);
  });

  it("stops a page at `<body` when the head is never closed", async () => {
    const seen = { count: 0 };
    async function* body() {
      yield enc("<html><head><title>x</title><BODY class=a>");
      yield* endless(64 * 1024, seen);
    }
    const { deps } = stack([{ status: 200, headers: HTML, body: body() }]);
    await fetchLimited(PAGE, "page", deps);
    expect(seen.count).toBeLessThanOrEqual(1);
  });

  it("does not trust a length: a page lying low is read to its cap, not to its word", async () => {
    const seen = { count: 0 };
    const { deps } = stack([
      { status: 200, headers: { ...HTML, "content-length": "10" }, body: endless(64 * 1024, seen) },
    ]);
    const got = await fetchLimited(PAGE, "page", deps);
    expect(got.bytes.length).toBeLessThanOrEqual(LIMITS.page.bytes);
  });

  // A deviation from the plan's table (a Content-Length over the cap refused, for the page): most real pages are over 256 KB and only their
  // head is read, so a page's length is not a reason; a picture's is (reported as F13950).
  it("reads a page whose declared length is past the cap, since only its head is read", async () => {
    const { deps } = stack([
      reply(200, { ...HTML, "content-length": "5000000" }, "<html><head><title>x</title></head>"),
    ]);
    await expect(fetchLimited(PAGE, "page", deps)).resolves.toBeDefined();
  });

  it("refuses a picture whose declared length is past its cap, reading none of it", async () => {
    const seen = { count: 0 };
    const { deps } = stack([
      { status: 200, headers: { "content-length": String(LIMITS.picture.bytes + 1) }, body: endless(1024, seen) },
    ]);
    expect(await kindOf(fetchLimited("https://cdn.example.com/a.png", "picture", deps))).toBe("size");
    expect(seen.count).toBe(0);
  });

  it("refuses a picture that runs past its cap with no length, or with a false one", async () => {
    const none = stack([{ status: 200, headers: {}, body: endless(64 * 1024, { count: 0 }) }]);
    expect(await kindOf(fetchLimited("https://cdn.example.com/a.png", "picture", none.deps))).toBe("size");
    const lying = stack([
      { status: 200, headers: { "content-length": "100" }, body: endless(64 * 1024, { count: 0 }) },
    ]);
    expect(await kindOf(fetchLimited("https://cdn.example.com/a.png", "picture", lying.deps))).toBe("size");
  });

  it("takes a picture exactly at its cap", async () => {
    const { deps } = stack([reply(200, {}, new Uint8Array(LIMITS.picture.bytes))]);
    const got = await fetchLimited("https://cdn.example.com/a.png", "picture", deps);
    expect(got.bytes.length).toBe(LIMITS.picture.bytes);
  });
});

describe("the time cap, for the whole call, body included", () => {
  it("gives up on a server that never answers, after 5 s", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(
      (request: Request) =>
        new Promise<Reply>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    const caught = kindOf(fetchLimited(PAGE, "page", { lookup: () => Promise.resolve([PUBLIC]), transport }));
    await vi.advanceTimersByTimeAsync(LIMITS.page.ms - 1);
    expect(transport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(await caught).toBe("timeout");
  });

  it("gives up on a body that trickles a byte a second, after 5 s in all", async () => {
    vi.useFakeTimers();
    async function* trickle() {
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        yield enc("a");
      }
    }
    const { deps } = stack([{ status: 200, headers: HTML, body: trickle() }]);
    const caught = kindOf(fetchLimited(PAGE, "page", deps));
    await vi.advanceTimersByTimeAsync(LIMITS.page.ms + 1500);
    expect(await caught).toBe("timeout");
  });

  it("gives up on a slow lookup too, and on a picture as on a page", async () => {
    vi.useFakeTimers();
    const slow = stack([reply(200, {}, "x")], () => new Promise<string[]>(() => undefined));
    const caught = kindOf(fetchLimited("https://cdn.example.com/a.png", "picture", slow.deps));
    await vi.advanceTimersByTimeAsync(LIMITS.picture.ms + 1);
    expect(await caught).toBe("timeout");
    expect(slow.transport).not.toHaveBeenCalled();
  });

  it("counts the redirects in the same 5 s", async () => {
    vi.useFakeTimers();
    // Each lookup takes 2 s: the third hop is past 5 s whatever each hop's own time.
    const { deps } = stack(
      [redirect("/1"), redirect("/2"), redirect("/3"), reply(200, HTML, "x")],
      () =>
        new Promise<string[]>((resolve) => {
          setTimeout(() => {
            resolve([PUBLIC]);
          }, 2000);
        }),
    );
    const caught = kindOf(fetchLimited(PAGE, "page", deps));
    await vi.advanceTimersByTimeAsync(7000);
    expect(await caught).toBe("timeout");
  });
});

// What the plan says, as numbers written out (not read from LIMITS, which the code could change with its tests).
describe("the plan's numbers", () => {
  it("are 256 KiB and 5 s for a page, 1 MiB and 5 s for a picture", () => {
    expect(LIMITS).toEqual({ page: { bytes: 262_144, ms: 5_000 }, picture: { bytes: 1_048_576, ms: 5_000 } });
  });
});

/** A body that notes whether its reader let go (`return()`), and how many parts were taken. */
function tracked(parts: Iterable<string>, endless = false) {
  const state = { taken: 0, released: 0 };
  const list = [...parts];
  const body: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        state.taken += 1;
        const part = endless ? (list[(state.taken - 1) % list.length] ?? "") : list[state.taken - 1];
        return Promise.resolve(
          part === undefined ? { done: true as const, value: undefined } : { done: false as const, value: enc(part) },
        );
      },
      return: () => {
        state.released += 1;
        return Promise.resolve({ done: true as const, value: undefined });
      },
    }),
  };
  return { state, body };
}

describe("the connection is let go", () => {
  it("after `</head>`: the body released, the request's signal aborted", async () => {
    const { state, body } = tracked(["<html><head><title>x</title></head>", "<body>more"]);
    const { deps, requests } = stack([{ status: 200, headers: HTML, body }]);
    await fetchLimited(PAGE, "page", deps);
    expect(state.released).toBe(1);
    expect(requests[0]?.signal.aborted).toBe(true);
  });

  it("after the cap, after a picture's size refusal, after a status or type refusal, and after a refused redirect", async () => {
    const big = "a".repeat(64 * 1024);
    const cases: [string, Reply][] = [];
    const t1 = tracked([big], true);
    const t2 = tracked([big], true);
    const t3 = tracked(["x"]);
    const t4 = tracked(["x"]);
    const t5 = tracked(["x"]);
    cases.push(
      ["page", { status: 200, headers: HTML, body: t1.body }],
      ["picture", { status: 200, headers: {}, body: t2.body }],
      ["page", { status: 404, headers: HTML, body: t3.body }],
    );
    cases.push(
      ["page", { status: 200, headers: { "content-type": "text/plain" }, body: t4.body }],
      ["page", { status: 302, headers: { location: "https://other.example.org/" }, body: t5.body }],
    );
    for (const [kind, one] of cases) {
      const { deps, requests } = stack([one]);
      await fetchLimited(kind === "page" ? PAGE : "https://cdn.example.com/a.png", kind as "page", deps).then(
        () => "read",
        (error: unknown) => error,
      );
      expect(requests[0]?.signal.aborted).toBe(true);
    }
    expect([t1.state.released, t2.state.released, t3.state.released, t4.state.released, t5.state.released]).toEqual([
      1, 1, 1, 1, 1,
    ]);
  });

  it("after a timeout: the signal aborted, whatever the transport does with it", async () => {
    vi.useFakeTimers();
    const seen: Request[] = [];
    const deps: Deps = {
      lookup: () => Promise.resolve([PUBLIC]),
      transport: (request) => (seen.push(request), new Promise<Reply>(() => undefined)),
    };
    const caught = kindOf(fetchLimited(PAGE, "page", deps));
    await vi.advanceTimersByTimeAsync(LIMITS.page.ms + 1);
    expect(await caught).toBe("timeout");
    expect(seen[0]?.signal.aborted).toBe(true);
  });
});

describe("more of what a reply may be", () => {
  it.each([[301], [302], [303], [307], [308]])("follows a %i", async (status) => {
    const { deps } = stack([redirect("/next", status), reply(200, HTML, "<html></html>")]);
    await expect(fetchLimited(PAGE, "page", deps)).resolves.toBeDefined();
  });

  it.each([[300], [304], [305], [306], [309]])(
    "does not follow a %i: it is a status refusal, and no second request is made",
    async (status) => {
      const { deps, transport } = stack([redirect("/next", status), reply(200, HTML, "x")]);
      expect(await kindOf(fetchLimited(PAGE, "page", deps))).toBe("status");
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it("takes a redirect to the same host in another case, and asks for the host in lower case", async () => {
    const { deps, requests } = stack([redirect("https://EXAMPLE.com/Next"), reply(200, HTML, "x")]);
    await fetchLimited(PAGE, "page", deps);
    expect(requests[1]?.url.hostname).toBe("example.com");
    expect(requests[1]?.url.pathname).toBe("/Next");
  });

  it("finds `</head>` in any case, and when it is split across two parts", async () => {
    for (const parts of [
      ["<html><head><title>x</title></HEAD><body>", "late"],
      ["<html><head><title>x</title></he", "ad><body>late"],
      ["<html><head><title>x</title><bo", "dy>late"],
    ]) {
      const { state, body } = tracked(parts, false);
      const { deps } = stack([{ status: 200, headers: HTML, body }]);
      await fetchLimited(PAGE, "page", deps);
      expect(state.taken).toBeLessThanOrEqual(2);
    }
  });

  it.each([["abc"], ["-1"], ["1e9"], [""], ["10, 20"]])(
    "does not trust a Content-Length of %j: a picture is held to its cap by the bytes it sends",
    async (length) => {
      const seen = { count: 0 };
      async function* endless() {
        await Promise.resolve();
        for (;;) {
          seen.count++;
          yield new Uint8Array(64 * 1024).fill(97);
        }
      }
      const { deps } = stack([{ status: 200, headers: { "content-length": length }, body: endless() }]);
      expect(await kindOf(fetchLimited("https://cdn.example.com/a.png", "picture", deps))).toBe("size");
    },
  );
});
