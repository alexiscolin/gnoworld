// The two ways to connect (docs/plans/link-previews.md §4): through the link way out (an HTTP CONNECT to `LINKS_PROXY`, whose rules
// refuse every private address after resolving), or, with no proxy, straight to the address the guard checked, refusing a private one at
// connect time as `net.Dialer.Control` would.
import { connect } from "node:net";
import type { Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import type { TLSSocket } from "node:tls";
import { isPublicAddress } from "./address.ts";
import { Refused } from "./fetch.ts";
import { bodyOf, ended, feedOf, kindOf } from "./body.ts";
import type { Reply, Transport } from "./fetch.ts";

const HEAD_MAX = 16 * 1024;
const END = Buffer.from("\r\n\r\n");
const STATUS = /^HTTP\/1\.[01] ([0-9]{3})/;

export interface Options {
  /** Extra trusted CA (PEM), for a test's own; the system's roots otherwise, and always the name checked. */
  ca?: string;
  /** The port to connect to, for a test's own; 443 otherwise. */
  port?: number;
  /** The address rule, for a test's own (a loopback server); `isPublicAddress` otherwise. */
  isPublic?: (address: string) => boolean;
}
interface Call {
  url: URL;
  headers: Record<string, string>;
  signal: AbortSignal;
}

// The first chunks of a stream up to the blank line that ends a head: the head's text and what followed it.
async function head(chunks: AsyncIterator<Buffer>, signal: AbortSignal): Promise<{ text: string; rest: Buffer }> {
  let seen = Buffer.alloc(0);
  for (;;) {
    const at = seen.indexOf(END);
    if (at >= 0) return { text: seen.subarray(0, at).toString("latin1"), rest: seen.subarray(at + END.length) };
    if (seen.length > HEAD_MAX) throw new Refused("network");
    const next = await chunks.next().catch(() => ended);
    if (next.done === true) throw new Refused(kindOf(signal));
    seen = Buffer.concat([seen, next.value]);
  }
}

// One request over an open TLS socket: the head, then the body as it is read. The socket closes when the signal fires.
async function exchange(socket: TLSSocket, { url, headers, signal }: Call): Promise<Reply> {
  const close = () => {
    socket.destroy();
  };
  signal.addEventListener("abort", close, { once: true });
  socket.once("close", () => {
    signal.removeEventListener("abort", close);
  });
  socket.on("error", () => undefined);
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`);
  socket.write(
    `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\n${lines.join("")}Connection: close\r\n\r\n`,
  );
  const chunks = socket[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  const { text, rest } = await head(chunks, signal);
  const [status, ...fields] = text.split("\r\n");
  const code = STATUS.exec(status ?? "")?.[1];
  if (code === undefined) throw new Refused("network");
  const parsed: Record<string, string> = {};
  for (const field of fields) {
    const at = field.indexOf(":");
    if (at > 0) parsed[field.slice(0, at).trim().toLowerCase()] = field.slice(at + 1).trim();
  }
  return { status: Number(code), headers: parsed, body: bodyOf(feedOf(chunks, rest, signal), parsed, signal) };
}

interface Secure {
  socket: Socket | undefined;
  at: { host?: string; port?: number };
  call: Call;
  ca: string | undefined;
}
const secured = ({ socket, at, call, ca }: Secure): Promise<TLSSocket> =>
  new Promise((resolve, reject) => {
    const tls = tlsConnect({
      ...at,
      socket,
      servername: call.url.hostname,
      ca: ca === undefined ? undefined : [ca],
      rejectUnauthorized: true,
    });
    const fail = () => {
      reject(new Refused(kindOf(call.signal)));
    };
    tls.once("secureConnect", () => {
      resolve(tls);
    });
    tls.once("error", fail);
    call.signal.addEventListener(
      "abort",
      () => {
        tls.destroy();
        fail();
      },
      { once: true },
    );
  });

// A TCP connection to the proxy, closed if the signal fires first.
const dial = (proxy: string, signal: AbortSignal): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const [host = "", port = ""] = proxy.split(":");
    const socket = connect({ host, port: Number(port) });
    const fail = () => {
      socket.destroy();
      reject(new Refused(kindOf(signal)));
    };
    socket.once("error", fail);
    signal.addEventListener("abort", fail, { once: true });
    socket.once("connect", () => {
      resolve(socket);
    });
  });

// The tunnel: CONNECT, and the proxy's answer. Anything but a 200 closes it; a 407 is the way out's refusal.
async function tunnel(proxy: string, { url, signal }: Call): Promise<Socket> {
  const socket = await dial(proxy, signal);
  signal.addEventListener(
    "abort",
    () => {
      socket.destroy();
    },
    { once: true },
  );
  socket.on("error", () => undefined);
  socket.write(`CONNECT ${url.hostname}:443 HTTP/1.1\r\nHost: ${url.hostname}:443\r\n\r\n`);
  try {
    const { text } = await head(socket[Symbol.asyncIterator]() as AsyncIterator<Buffer>, signal);
    const code = STATUS.exec(text)?.[1];
    if (code !== "200") throw new Refused(code === "407" ? "egress" : "network");
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

/** CONNECT `host:443` to the proxy (`host:port`), TLS to the page over it (certificate checked against the name). A 407 is `egress`.
 * A TLS failure, a hang-up or a reply head past 16 KiB is `network`; the connection closes when the request's signal aborts. */
export function proxyTransport(proxy: string, options: Options = {}): Transport {
  return async ({ url, headers, signal }) => {
    const call = { url, headers, signal };
    const socket = await tunnel(proxy, call);
    try {
      return await exchange(await secured({ socket, at: {}, call, ca: options.ca }), call);
    } catch (error) {
      socket.destroy();
      throw error;
    }
  };
}

/** TLS straight to `request.address`, certificate checked against the name; a non-public address is refused before any socket. */
export function directTransport(options: Options = {}): Transport {
  return async ({ url, address, headers, signal }) => {
    if (address === undefined || !(options.isPublic ?? isPublicAddress)(address)) throw new Refused("private");
    const call = { url, headers, signal };
    return exchange(
      await secured({ socket: undefined, at: { host: address, port: options.port ?? 443 }, call, ca: options.ca }),
      call,
    );
  };
}
