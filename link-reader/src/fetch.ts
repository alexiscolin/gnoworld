// One guarded fetch: a page's head or a picture's bytes (docs/plans/link-previews.md §4): the URL rule at every hop, the DNS answer
// checked at every hop and the connection made to the address checked, three redirects at most (same host, https, 443), 200 only, no
// content encoding, a byte cap and a time cap for the whole call, body included.
import { isPublicAddress } from "./address.ts";
import { readableUrl } from "./url.ts";

export type Kind =
  "url" | "dns" | "private" | "egress" | "network" | "redirect" | "status" | "type" | "size" | "timeout" | "empty";

/** Why a card was not made: a kind and no words, never the URL (the logs keep the kind alone). */
export class Refused extends Error {
  readonly kind: Kind;
  constructor(kind: Kind) {
    super(kind);
    this.kind = kind;
  }
}

export interface Request {
  url: URL;
  /** The address the guard checked, to connect to; undefined when a proxy resolves the name (its own rules refuse private ones). */
  address: string | undefined;
  headers: Record<string, string>;
  signal: AbortSignal;
}
export interface Reply {
  status: number;
  /** Lower-case names. */
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
}
export type Transport = (request: Request) => Promise<Reply>;
export interface Deps {
  /** A name's addresses; undefined when the way out resolves (the reader has no DNS of its own behind its proxy). */
  lookup: ((host: string) => Promise<string[]>) | undefined;
  transport: Transport;
  /** Ends a fetch early, as a timeout. */
  signal?: AbortSignal | undefined;
}

export const LIMITS = {
  page: { bytes: 256 * 1024, ms: 5000 },
  picture: { bytes: 1024 * 1024, ms: 5000 },
} as const;
export const USER_AGENT = "gnoworld-link-reader/1 (+https://gnoworld.example/links)";

const REDIRECTS = [301, 302, 303, 307, 308];
const HEADS = { page: "text/html,application/xhtml+xml", picture: "image/jpeg,image/png" };
const PAGES = ["text/html", "application/xhtml+xml"];
const END_OF_HEAD = /<\/head|<body/i;
type Which = "page" | "picture";
interface Job {
  kind: Which;
  deps: Deps;
  signal: AbortSignal;
}
interface Fetched {
  bytes: Uint8Array;
  url: URL;
  type: string;
}

// Let go of a body nobody will read.
const release = async (body: AsyncIterable<Uint8Array>): Promise<void> => {
  await body[Symbol.asyncIterator]().return?.();
};

async function read(reply: Reply, { kind, signal }: Job): Promise<Uint8Array> {
  const { bytes: cap } = LIMITS[kind];
  const parts: Uint8Array[] = [];
  let size = 0;
  let tail = "";
  for await (const part of reply.body) {
    if (signal.aborted) break;
    parts.push(part);
    size += part.length;
    if (kind === "picture" && size > cap) throw new Refused("size");
    const text = tail + Buffer.from(part).toString("latin1");
    if (kind === "page" && (size >= cap || END_OF_HEAD.test(text))) break;
    tail = text.slice(-8);
  }
  const all = Buffer.concat(parts).subarray(0, cap);
  return new Uint8Array(all.buffer, all.byteOffset, all.length);
}

// The addresses of a name, checked: all public, or a refusal. None behind a proxy, which resolves and refuses by itself.
async function addressOf(host: string, lookup: Deps["lookup"]): Promise<string | undefined> {
  if (lookup === undefined) return undefined;
  const found = await lookup(host).catch(() => []);
  if (found.length === 0) throw new Refused("dns");
  if (!found.every(isPublicAddress)) throw new Refused("private");
  return found[0];
}

// Where a redirect leads: the same host, still under the URL rule.
function redirectTo(reply: Reply, from: URL): URL {
  const location = reply.headers["location"] ?? "";
  const next = location === "" ? undefined : readableUrl(URL.parse(location, from.href)?.href ?? "");
  if (next?.hostname !== from.hostname) throw new Refused("redirect");
  return next;
}

const header = (reply: Reply, name: string) => reply.headers[name] ?? "";
const wrongType = (reply: Reply, kind: Which) =>
  (kind === "page" && !PAGES.includes(header(reply, "content-type").split(";")[0]?.trim().toLowerCase() ?? "")) ||
  (reply.headers["content-encoding"] ?? "identity") !== "identity";
const tooLong = (reply: Reply, kind: Which) =>
  kind === "picture" &&
  /^[0-9]+$/.test(header(reply, "content-length")) &&
  Number(header(reply, "content-length")) > LIMITS.picture.bytes;

// Why a reply that is not a redirect is not taken, and a picture's declared length past its cap.
function refusal(reply: Reply, kind: Which): Kind | undefined {
  if (reply.status !== 200) return "status";
  return wrongType(reply, kind) ? "type" : tooLong(reply, kind) ? "size" : undefined;
}

async function run(raw: string, job: Job): Promise<Fetched> {
  const first = readableUrl(raw);
  if (first === undefined) throw new Refused("url");
  let url: URL = first;
  for (let hops = 0; ; hops += 1) {
    const headers = { "user-agent": USER_AGENT, accept: HEADS[job.kind], "accept-encoding": "identity" };
    const address = await addressOf(url.hostname, job.deps.lookup);
    const reply = await job.deps.transport({ url, address, headers, signal: job.signal });
    if (REDIRECTS.includes(reply.status)) {
      await release(reply.body);
      if (hops === 3) throw new Refused("redirect");
      url = redirectTo(reply, first);
      continue;
    }
    const refused = refusal(reply, job.kind);
    if (refused !== undefined) {
      await release(reply.body);
      throw new Refused(refused);
    }
    return { bytes: await read(reply, job), url, type: reply.headers["content-type"] ?? "" };
  }
}

/** The bytes of the page's head (to `</head>` or `<body`, at most the cap) or of the picture (refused past its cap). */
export async function fetchLimited(raw: string, kind: Which, deps: Deps): Promise<Fetched> {
  const stop = deps.signal;
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  const timer = setTimeout(abort, LIMITS[kind].ms);
  const late = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(new Refused("timeout"));
    });
  });
  stop?.addEventListener("abort", abort);
  if (stop?.aborted === true) abort();
  try {
    return await Promise.race([run(raw, { kind, deps, signal: controller.signal }), late]);
  } finally {
    clearTimeout(timer);
    stop?.removeEventListener("abort", abort);
    controller.abort();
  }
}
