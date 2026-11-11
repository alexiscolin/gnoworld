import { createServer as plainServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";
import { createSecureContext, createServer as tlsServer } from "node:tls";
import type { TLSSocket } from "node:tls";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Refused, USER_AGENT } from "./fetch.ts";
import type { Reply, Request } from "./fetch.ts";
import { makeCertificates } from "./tlsFixtures.ts";
import type { Certificates } from "./tlsFixtures.ts";
import { directTransport, proxyTransport } from "./transport.ts";

// The TLS path, with a certificate authority of the test's own, made at the start of the run with openssl in a temporary folder
// (tlsFixtures.ts) and trusted only by the `ca` option: the names are checked, the system's roots are not the test's.
let certs: Certificates;
let CA = "";
beforeAll(() => {
  certs = makeCertificates();
  CA = certs.ca;
});
afterAll(() => {
  certs.remove();
});
const context = (leaf: string) => createSecureContext(certs.leaf(leaf));

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});
const listen = async (server: Server): Promise<number> => {
  closers.push(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
};

interface Seen {
  connect: string[];
  names: string[];
  requests: string[];
  tunnels: Socket[];
}
/** A TLS server (certificate of `leaf`) that answers every request with `answer(socket)`; its SNI names and requests are noted. */
function origin(leaf: string, seen: Seen, answer: (socket: TLSSocket) => void) {
  const server = tlsServer({
    SNICallback: (name, done) => {
      seen.names.push(name);
      done(null, context(leaf));
    },
  });
  server.on("secureConnection", (socket) => {
    socket.on("error", () => undefined);
    socket.once("data", (data: Buffer) => {
      seen.requests.push(data.toString("latin1"));
      answer(socket);
    });
  });
  return server;
}
const ok =
  (body: string, extra = "") =>
  (socket: TLSSocket) =>
    socket.end(
      `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${String(Buffer.byteLength(body))}\r\n${extra}Connection: close\r\n\r\n${body}`,
    );

/** The way out: answers a CONNECT with `connect` (a status line) and, for a 200, hands the socket to the TLS origin; undefined hangs up. */
async function wayOut(connect: string | undefined, behind?: Server) {
  const seen: Seen = { connect: [], names: [], requests: [], tunnels: [] };
  const server = plainServer((socket) => {
    seen.tunnels.push(socket);
    socket.on("error", () => undefined);
    socket.once("data", (data) => {
      seen.connect.push(data.toString("latin1"));
      if (connect === undefined) return void socket.destroy();
      socket.write(`${connect}\r\n\r\n`);
      if (connect.includes(" 200") && behind !== undefined) behind.emit("connection", socket);
    });
  });
  const port = await listen(server);
  return { seen, address: `127.0.0.1:${String(port)}` };
}
const request = (url: string, extra: Partial<Request> = {}): Request => ({
  url: new URL(url),
  address: undefined,
  headers: { "user-agent": USER_AGENT, accept: "text/html", "accept-encoding": "identity" },
  signal: AbortSignal.timeout(3000),
  ...extra,
});
const kind = async (promise: Promise<unknown>) => {
  const caught: unknown = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(Refused);
  return (caught as Refused).kind;
};
const read = async (reply: Reply): Promise<string> => {
  const parts: Buffer[] = [];
  for await (const part of reply.body) parts.push(Buffer.from(part));
  return Buffer.concat(parts).toString("utf8");
};
const tunnelled = async (leaf: string, answer: (socket: TLSSocket) => void) => {
  const seen: Seen = { connect: [], names: [], requests: [], tunnels: [] };
  const behind = origin(leaf, seen, answer);
  const way = await wayOut("HTTP/1.1 200 Connection Established", behind);
  // One record of what each side saw.
  return { ...way, seen: Object.assign(way.seen, { names: seen.names, requests: seen.requests }) };
};

describe("through the link way out", () => {
  it("asks the proxy to CONNECT to the page's host on 443, by name, and sends nothing of the page's path or query to it", async () => {
    const way = await wayOut("HTTP/1.1 407 Proxy Authentication Required");
    await kind(proxyTransport(way.address)(request("https://example.com/secret/path?token=1")));
    expect(way.seen.connect).toHaveLength(1);
    expect(way.seen.connect[0]).toMatch(/^CONNECT example\.com:443 HTTP\/1\.1\r\n/);
    expect(way.seen.connect[0]).not.toContain("secret");
    expect(way.seen.connect[0]).not.toContain("token");
  });

  it("calls a 407 the way out's refusal (a private address, a name it does not resolve to a public one)", async () => {
    const way = await wayOut("HTTP/1.1 407 Proxy Authentication Required");
    expect(await kind(proxyTransport(way.address)(request("https://10.0.0.1.nip.io/")))).toBe("egress");
  });

  it.each([
    ["HTTP/1.1 403 Forbidden"],
    ["HTTP/1.1 502 Bad Gateway"],
    ["HTTP/1.1 503 Service Unavailable"],
    ["HTTP/1.1 301 Moved"],
    ["garbage"],
  ])("refuses any proxy answer but 200: %s", async (line) => {
    const way = await wayOut(line);
    expect(["egress", "network"]).toContain(await kind(proxyTransport(way.address)(request("https://example.com/"))));
  });

  it("fails as a network error when the proxy hangs up, and when nothing listens", async () => {
    const way = await wayOut(undefined);
    expect(await kind(proxyTransport(way.address)(request("https://example.com/")))).toBe("network");
    expect(await kind(proxyTransport("127.0.0.1:1")(request("https://example.com/")))).toBe("network");
  });

  it("never connects anywhere but the proxy, whatever address it is given", async () => {
    const way = await wayOut("HTTP/1.1 407 Proxy Authentication Required");
    await kind(proxyTransport(way.address)(request("https://example.com/", { address: "10.0.0.1" })));
    expect(way.seen.tunnels).toHaveLength(1);
  });

  it("reads a page over TLS: status, headers in lower case, the body; the server saw the name (SNI), the Host and the few headers", async () => {
    const way = await tunnelled("example.com", ok("<html>hi</html>", "X-Extra: yes\r\n"));
    const reply = await proxyTransport(way.address, { ca: CA })(request("https://example.com/path?q=1"));
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe("text/html");
    expect(reply.headers["x-extra"]).toBe("yes");
    expect(await read(reply)).toBe("<html>hi</html>");
    expect(way.seen.names).toEqual(["example.com"]);
    const sent = way.seen.requests[0] ?? "";
    expect(sent).toMatch(/^GET \/path\?q=1 HTTP\/1\.1\r\n/);
    expect(sent.toLowerCase()).toContain("host: example.com\r\n");
    expect(sent.toLowerCase()).toContain(`user-agent: ${USER_AGENT.toLowerCase()}\r\n`);
    expect(sent.toLowerCase()).not.toMatch(/cookie|referer|authorization|accept-language/);
  });

  it("decodes a chunked body, whatever way the parts are cut: sizes in hex, an extension, a size line split across writes, a last chunk", async () => {
    const way = await tunnelled("example.com", (socket) => {
      socket.write("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n5;ext=1\r\nhel");
      setTimeout(() => socket.write("lo\r\n0"), 10);
      setTimeout(() => socket.write("e\r\n, and more...!\r\n0\r\n\r\n"), 20);
      setTimeout(() => socket.end(), 30);
    });
    const reply = await proxyTransport(way.address, { ca: CA })(request("https://example.com/"));
    expect(await read(reply)).toBe("hello, and more...!");
  });

  it("fails a chunked body that ends before its last chunk, and one with a size that is not hex", async () => {
    const cut = await tunnelled("example.com", (socket) =>
      socket.end("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n"),
    );
    expect(await kind(proxyTransport(cut.address, { ca: CA })(request("https://example.com/")).then(read))).toBe(
      "network",
    );
    const bad = await tunnelled("example.com", (socket) =>
      socket.end("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\nhello\r\n0\r\n\r\n"),
    );
    expect(await kind(proxyTransport(bad.address, { ca: CA })(request("https://example.com/")).then(read))).toBe(
      "network",
    );
  });

  it("refuses a certificate for another name, a self-signed one, and one from a CA it does not trust (the system's roots)", async () => {
    const other = await tunnelled("other.test", ok("x"));
    expect(await kind(proxyTransport(other.address, { ca: CA })(request("https://example.com/")))).toBe("network");
    const self = await tunnelled("selfsigned", ok("x"));
    expect(await kind(proxyTransport(self.address, { ca: CA })(request("https://example.com/")))).toBe("network");
    const unknown = await tunnelled("example.com", ok("x"));
    expect(await kind(proxyTransport(unknown.address)(request("https://example.com/")))).toBe("network");
    // None of the three got to see the request.
    expect([other, self, unknown].flatMap((way) => way.seen.requests)).toEqual([]);
  });

  it("fails a body cut short as a network error, when the reply promised more than came", async () => {
    const way = await tunnelled("example.com", (socket) => {
      socket.write("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 100\r\n\r\nshort");
      setTimeout(() => socket.destroy(), 20);
    });
    const reply = await proxyTransport(way.address, { ca: CA })(request("https://example.com/"));
    expect(await kind(read(reply))).toBe("network");
  });

  it("refuses a reply head past 16 KiB, which a hostile server could grow without end", async () => {
    const way = await tunnelled("example.com", (socket) =>
      socket.end(`HTTP/1.1 200 OK\r\nX-Big: ${"a".repeat(100_000)}\r\n\r\nbody`),
    );
    const outcome = await proxyTransport(way.address, { ca: CA })(request("https://example.com/")).then(
      read,
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(Refused);
  });

  it("gives up on a way out that accepts and says nothing, when the request's signal fires, and drops the socket", async () => {
    const sockets: Socket[] = [];
    const silent = plainServer((socket) => {
      sockets.push(socket);
      socket.on("error", () => undefined);
      socket.resume();
    });
    const port = await listen(silent);
    expect(
      await kind(
        proxyTransport(`127.0.0.1:${String(port)}`)(
          request("https://example.com/", { signal: AbortSignal.timeout(300) }),
        ),
      ),
    ).toBe("timeout");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sockets.every((socket) => socket.destroyed)).toBe(true);
  });

  it("gives up on a tunnel that opens and then a server that says nothing, and closes the tunnel", async () => {
    const way = await tunnelled("example.com", () => undefined);
    const outcome = proxyTransport(way.address, { ca: CA })(
      request("https://example.com/", { signal: AbortSignal.timeout(400) }),
    );
    expect(await kind(outcome.then(read))).toBe("timeout");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(way.seen.tunnels.every((socket) => socket.destroyed)).toBe(true);
  });

  it("closes the connection when the request's signal aborts after the reply began, ending the body with a timeout", async () => {
    const controller = new AbortController();
    const way = await tunnelled("example.com", (socket) =>
      socket.write("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 1000\r\n\r\nstart"),
    );
    const reply = await proxyTransport(way.address, { ca: CA })(
      request("https://example.com/", { signal: controller.signal }),
    );
    setTimeout(() => {
      controller.abort();
    }, 50);
    expect(await kind(read(reply))).toBe("timeout");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(way.seen.tunnels.every((socket) => socket.destroyed)).toBe(true);
  });
});

describe("straight to an address (no proxy: development)", () => {
  it.each([
    ["127.0.0.1"],
    ["10.0.0.1"],
    ["169.254.169.254"],
    ["::1"],
    ["fc00::1"],
    ["::ffff:127.0.0.1"],
    ["example.com"],
  ])("refuses %s before any socket, as the dialer's Control would", async (address) => {
    const local = await wayOut("");
    const port = Number(local.address.split(":")[1]);
    expect(await kind(directTransport({ port })(request("https://example.com/", { address })))).toBe("private");
    expect(local.seen.tunnels).toHaveLength(0);
  });

  it("refuses a request with no address: it has no resolver of its own to trust", async () => {
    expect(await kind(directTransport()(request("https://example.com/")))).toBe("private");
  });

  it("connects to the address it was given, never to a name's own: the name resolves nowhere here, the server is found by its address", async () => {
    const seen: Seen = { connect: [], names: [], requests: [], tunnels: [] };
    const port = await listen(origin("example.com", seen, ok("direct")));
    const reply = await directTransport({ ca: CA, port, isPublic: () => true })(
      request("https://example.com/x", { address: "127.0.0.1" }),
    );
    expect(await read(reply)).toBe("direct");
    expect(seen.names).toEqual(["example.com"]);
  });

  it("checks the certificate against the name over the pinned connection: another name's, refused", async () => {
    const seen: Seen = { connect: [], names: [], requests: [], tunnels: [] };
    const port = await listen(origin("other.test", seen, ok("x")));
    expect(
      await kind(
        directTransport({ ca: CA, port, isPublic: () => true })(
          request("https://example.com/", { address: "127.0.0.1" }),
        ),
      ),
    ).toBe("network");
    expect(seen.requests).toEqual([]);
  });
});
