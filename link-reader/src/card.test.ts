import { ReaderCard } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CARD_MS, readCard } from "./card.ts";
import { Refused } from "./fetch.ts";
import type { Deps, Reply, Request } from "./fetch.ts";
import type { Codecs, Raster } from "./picture.ts";
import { photo } from "./testImages.ts";

const PUBLIC = "93.184.216.34";
const HTML = { "content-type": "text/html" };
const enc = (text: string) => new TextEncoder().encode(text);
async function* once(bytes: Uint8Array) {
  await Promise.resolve();
  yield bytes;
}
const html = (head: string) =>
  ({ status: 200, headers: HTML, body: once(enc(`<html><head>${head}</head><body></body></html>`)) }) satisfies Reply;
const image = (bytes: Uint8Array) =>
  ({ status: 200, headers: { "content-type": "image/jpeg" }, body: once(bytes) }) satisfies Reply;
const og = (property: string, content: string) => `<meta property="${property}" content="${content}">`;
const PAGE = "https://example.com/post";

/** Hosts answer by URL. */
function web(routes: Record<string, () => Reply>) {
  const requests: Request[] = [];
  const lookups: string[] = [];
  const deps: Deps = {
    lookup: (host) => {
      lookups.push(host);
      return Promise.resolve([host === "internal.example.com" ? "10.0.0.1" : PUBLIC]);
    },
    transport: (request) => {
      requests.push(request);
      const route = routes[request.url.href];
      return Promise.resolve(
        route === undefined ? { status: 404, headers: {}, body: once(new Uint8Array()) } : route(),
      );
    },
  };
  return { deps, requests, lookups };
}
const raster = (width: number, height: number): Raster => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});
const codecs = (): Codecs => ({
  decodeJpeg: () => Promise.resolve(raster(640, 480)),
  decodePng: () => Promise.resolve(raster(640, 480)),
  resize: (_raster, width, height) => Promise.resolve(raster(width, height)),
  encodeJpeg: () => Promise.resolve(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9])),
});
const kindOf = async (promise: Promise<unknown>) => {
  const caught: unknown = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(Refused);
  return (caught as Refused).kind;
};

describe("a card", () => {
  it("is the head's texts and a re-encoded picture, in the shape the server parses", async () => {
    const { deps, requests } = web({
      [PAGE]: () =>
        html(
          og("og:title", "T") +
            og("og:description", "D") +
            og("og:site_name", "S") +
            og("og:image", "https://cdn.example.com/p.jpg"),
        ),
      "https://cdn.example.com/p.jpg": () => image(photo()),
    });
    const card = await readCard(PAGE, deps, codecs());
    expect(ReaderCard.parse(card)).toEqual({
      title: "T",
      description: "D",
      site: "S",
      picture: { width: 160, height: 120, jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]).toString("base64") },
    });
    expect(requests.map((request) => request.url.href)).toEqual([PAGE, "https://cdn.example.com/p.jpg"]);
  });

  it("fetches the picture through the same guard: its host looked up, its address checked", async () => {
    const { deps, lookups, requests } = web({
      [PAGE]: () => html(og("og:title", "T") + og("og:image", "https://cdn.example.com/p.jpg")),
      "https://cdn.example.com/p.jpg": () => image(photo()),
    });
    await readCard(PAGE, deps, codecs());
    expect(lookups).toEqual(["example.com", "cdn.example.com"]);
    expect(requests[1]?.address).toBe(PUBLIC);
  });

  it("has no picture, still a card, when the page names none", async () => {
    const { deps } = web({ [PAGE]: () => html(og("og:title", "T")) });
    expect(await readCard(PAGE, deps, codecs())).toEqual({ title: "T", description: "", site: "", picture: null });
  });

  it.each([
    ["a missing picture", "https://cdn.example.com/missing.jpg"],
    ["a picture that is a page", "https://cdn.example.com/page.html"],
  ])("has no picture, still a card, for %s", async (_name, address) => {
    const { deps } = web({
      [PAGE]: () => html(og("og:title", "T") + og("og:image", address)),
      "https://cdn.example.com/page.html": () => image(enc("<html><script>alert(1)</script></html>")),
    });
    expect(await readCard(PAGE, deps, codecs())).toEqual({ title: "T", description: "", site: "", picture: null });
  });

  it.each([
    ["a picture on a name that resolves private", "https://internal.example.com/p.jpg"],
    ["a picture at an IP literal", "https://10.0.0.1/p.jpg"],
    ["a picture over http", "http://cdn.example.com/p.jpg"],
    ["a picture on another port", "https://cdn.example.com:8443/p.jpg"],
  ])("has no picture, still a card, and connects to nothing for %s", async (_name, address) => {
    const { deps, requests } = web({ [PAGE]: () => html(og("og:title", "T") + og("og:image", address)) });
    expect(await readCard(PAGE, deps, codecs())).toEqual({ title: "T", description: "", site: "", picture: null });
    expect(requests.map((request) => request.url.href)).toEqual([PAGE]);
  });

  it("resolves a relative picture against the page's final address, after a redirect", async () => {
    const { deps, requests } = web({
      [PAGE]: () => ({ status: 301, headers: { location: "/blog/deep/post" }, body: once(new Uint8Array()) }),
      "https://example.com/blog/deep/post": () => html(og("og:title", "T") + og("og:image", "p.jpg")),
      "https://example.com/blog/deep/p.jpg": () => image(photo()),
    });
    expect((await readCard(PAGE, deps, codecs())).picture).not.toBeNull();
    expect(requests.map((request) => request.url.href).at(-1)).toBe("https://example.com/blog/deep/p.jpg");
  });

  it("reads a page in iso-8859-1 as the header says", async () => {
    const { deps } = web({
      [PAGE]: () => ({
        status: 200,
        headers: { "content-type": "text/html; charset=iso-8859-1" },
        body: once(
          Uint8Array.from([
            ...Buffer.from("<html><head><title>caf", "latin1"),
            0xe9,
            ...Buffer.from("</title></head>", "latin1"),
          ]),
        ),
      }),
    });
    expect((await readCard(PAGE, deps, codecs())).title).toBe("caf\u00e9");
  });

  it("has no picture when its fetch is refused for a redirect to another host", async () => {
    const { deps } = web({
      [PAGE]: () => html(og("og:title", "T") + og("og:image", "https://cdn.example.com/p.jpg")),
      "https://cdn.example.com/p.jpg": () => ({
        status: 302,
        headers: { location: "https://evil.example.net/p.jpg" },
        body: once(new Uint8Array()),
      }),
    });
    expect((await readCard(PAGE, deps, codecs())).picture).toBeNull();
  });

  it("gives the page's texts as the head parser makes them: hidden characters out, caps held", async () => {
    const { deps } = web({ [PAGE]: () => html(og("og:title", `\u202eT${"x".repeat(300)}`)) });
    const card = await readCard(PAGE, deps, codecs());
    expect(card.title.length).toBe(200);
    expect(card.title.startsWith("Tx")).toBe(true);
  });
});

describe("no card", () => {
  it("is a refusal of the URL before any lookup, for a URL the rule refuses", async () => {
    const { deps, lookups, requests } = web({});
    expect(await kindOf(readCard("http://example.com/", deps, codecs()))).toBe("url");
    expect(await kindOf(readCard("https://127.0.0.1/", deps, codecs()))).toBe("url");
    expect(lookups).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("is `empty` for a page with no title", async () => {
    const { deps } = web({ [PAGE]: () => html(og("og:description", "only")) });
    expect(await kindOf(readCard(PAGE, deps, codecs()))).toBe("empty");
  });

  it("is the fetch's own kind for a page that fails: a status, a type, a redirect off the host, a private name", async () => {
    expect(await kindOf(readCard("https://example.com/none", web({}).deps, codecs()))).toBe("status");
    expect(
      await kindOf(
        readCard(
          PAGE,
          web({ [PAGE]: () => ({ status: 200, headers: { "content-type": "image/png" }, body: once(enc("x")) }) }).deps,
          codecs(),
        ),
      ),
    ).toBe("type");
    expect(
      await kindOf(
        readCard(
          PAGE,
          web({
            [PAGE]: () => ({ status: 301, headers: { location: "https://other.example.org/" }, body: once(enc("")) }),
          }).deps,
          codecs(),
        ),
      ),
    ).toBe("redirect");
    expect(await kindOf(readCard("https://internal.example.com/x", web({}).deps, codecs()))).toBe("private");
  });

  it.each([[`\u202e\u200b${"a".repeat(900)}\ud83d`], ["&#xD800;&#0;"], ["\u0007\u001b"], ["&amp;lt;b&amp;gt;"]])(
    "is always a card the schema accepts, whatever the page held: %j",
    async (text) => {
      const { deps } = web({
        [PAGE]: () =>
          html(
            og("og:title", text) + og("og:description", text) + og("og:site_name", text) + "<title>fallback</title>",
          ),
      });
      const card = await readCard(PAGE, deps, codecs());
      expect(ReaderCard.safeParse(card).success).toBe(true);
    },
  );

  it("fetches no picture for a page with no title, whatever its og:image", async () => {
    const { deps, requests } = web({
      [PAGE]: () => html(og("og:image", "https://cdn.example.com/p.jpg")),
      "https://cdn.example.com/p.jpg": () => image(photo()),
    });
    expect(await kindOf(readCard(PAGE, deps, codecs()))).toBe("empty");
    expect(requests).toHaveLength(1);
  });

  it("does not run a decoder on a picture the guard refused", async () => {
    const decode = vi.fn(() => Promise.resolve(raster(640, 480)));
    const { deps } = web({
      [PAGE]: () => html(og("og:title", "T") + og("og:image", "https://cdn.example.com/missing.jpg")),
    });
    await readCard(PAGE, deps, { ...codecs(), decodeJpeg: decode, decodePng: decode });
    expect(decode).not.toHaveBeenCalled();
  });
});

describe("one deadline for the whole card", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const PICTURE = "https://cdn.example.com/p.jpg";
  const ROUTES: Record<string, () => Reply> = {
    [PAGE]: () => html(og("og:title", "T") + og("og:image", PICTURE)),
    [PICTURE]: () => image(photo()),
  };
  // Hosts that answer by URL after `ms`, or never; the signal of each request kept.
  const slow = (ms: number | undefined) => {
    const signals: AbortSignal[] = [];
    const deps: Deps = {
      lookup: () => Promise.resolve([PUBLIC]),
      transport: (request) => {
        signals.push(request.signal);
        const reply = ROUTES[request.url.href] ?? (() => ({ status: 404, headers: {}, body: once(new Uint8Array()) }));
        return new Promise((resolve) => {
          if (ms !== undefined)
            setTimeout(() => {
              resolve(reply());
            }, ms);
        });
      },
    };
    return { deps, signals };
  };

  it("stops the picture at the card's deadline, though the page and the picture each come within their own 5 s", async () => {
    vi.useFakeTimers();
    expect(CARD_MS).toBe(7000);
    const { deps, signals } = slow(4000);
    const decode = vi.fn(() => Promise.resolve(raster(640, 480)));
    const card = readCard(PAGE, deps, { ...codecs(), decodeJpeg: decode });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await card).picture).toBeNull();
    expect(signals[1]?.aborted).toBe(true);
    expect(decode).not.toHaveBeenCalled();
  });

  it("decodes nothing once the deadline passed while the picture waited for the decoder", async () => {
    vi.useFakeTimers();
    const { deps } = slow(0);
    const hold = <T>(job: () => Promise<T>) =>
      new Promise<T>((resolve) => {
        setTimeout(() => {
          resolve(job());
        }, 8000);
      });
    const decode = vi.fn(() => Promise.resolve(raster(640, 480)));
    const card = readCard(PAGE, { ...deps, hold }, { ...codecs(), decodeJpeg: decode });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await card).picture).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it("stops the reader's work at once when its asker leaves: the fetch's signal fires", async () => {
    vi.useFakeTimers();
    const { deps, signals } = slow(undefined);
    const left = new AbortController();
    const card = readCard(PAGE, { ...deps, signal: left.signal }, codecs()).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(signals[0]?.aborted).toBe(false);
    left.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(signals[0]?.aborted).toBe(true);
    expect(await card).toBeInstanceOf(Refused);
  });
});

describe("a picture left out", () => {
  const PICTURE = "https://cdn.example.com/p.jpg";
  it.each([
    { name: "its fetch's refusal", served: photo, address: "https://cdn.example.com/none.jpg", kind: "status" },
    { name: "a header that is no picture", served: () => enc("<html></html>"), address: PICTURE, kind: "header" },
    { name: "a decoder that fails", served: photo, address: PICTURE, kind: "decode", fails: true },
  ])("logs $name, its kind alone, never the URL", async ({ served, address, kind, fails }) => {
    const { deps } = web({
      [PAGE]: () => html(og("og:title", "T") + og("og:image", address)),
      [PICTURE]: () => image(served()),
    });
    const log = vi.fn();
    const broken = fails === true ? { decodeJpeg: () => Promise.reject(new Error("trap")) } : {};
    const card = await readCard(PAGE, { ...deps, log }, { ...codecs(), ...broken });
    expect(card.picture).toBeNull();
    expect(log.mock.calls).toEqual([[{ picture: kind }]]);
  });

  it("logs nothing for a card whose picture was made", async () => {
    const { deps } = web({
      [PAGE]: () => html(og("og:title", "T") + og("og:image", "https://cdn.example.com/p.jpg")),
      "https://cdn.example.com/p.jpg": () => image(photo()),
    });
    const log = vi.fn();
    expect((await readCard(PAGE, { ...deps, log }, codecs())).picture).not.toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
});
