// The reader's HTTP side (docs/plans/link-previews.md §3 step 3): `POST /card {url}` answers a `ReaderCard`, or 422 `{error: kind}`;
// at most `max` reads at once, else 503; `GET /health` for the container's check. Nothing else.
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { ReaderCard } from "@gnoworld/schemas";
import { readBody, serverOptions } from "@gnoworld/service/http";
import { z } from "zod";
import { Refused } from "./fetch.ts";
import type { Kind } from "./fetch.ts";

const BODY_MAX = 4096;
const Ask = z.strictObject({ url: z.string() });

export interface ServerDeps {
  /** The card of a URL; `signal` fires when its asker left. */
  read: (url: string, signal: AbortSignal) => Promise<ReaderCard>;
  max: number;
  /** One line per failure: its kind alone, never the URL; `gone` for a client that left before its answer. */
  log: (entry: { kind: Kind | "bad_request" | "busy" | "crash" | "gone" }) => void;
}

const send = (response: ServerResponse, status: number, body = "") =>
  response
    .writeHead(status, { "content-type": "application/json", "cache-control": "no-store", connection: "close" })
    .end(body);

// The URL a request asks for, or undefined for a body that is not exactly `{"url": <string>}`.
function urlOf(text: string): string | undefined {
  let asked: unknown;
  try {
    asked = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = Ask.safeParse(asked);
  return parsed.success ? parsed.data.url : undefined;
}

// One request, its response, and the signal its client's leaving fires.
interface Exchange {
  request: IncomingMessage;
  response: ServerResponse;
  left: AbortSignal;
}

// The answer to one page: its card, the kind of its refusal (422), or nothing at all (500).
async function answer({ read, log }: ServerDeps, url: string, { response, left }: Exchange): Promise<void> {
  try {
    send(response, 200, JSON.stringify(await read(url, left)));
  } catch (error) {
    const kind = left.aborted ? "gone" : error instanceof Refused ? error.kind : "crash";
    log({ kind });
    send(
      response,
      error instanceof Refused ? 422 : 500,
      error instanceof Refused ? JSON.stringify({ error: kind }) : "",
    );
  }
}

async function card(deps: ServerDeps, exchange: Exchange): Promise<void> {
  const { request, response } = exchange;
  const text = await readBody(request, BODY_MAX);
  if (text === undefined) return void send(response, 413);
  const url = text === null ? undefined : urlOf(text);
  if (url === undefined) {
    deps.log({ kind: "bad_request" });
    return void send(response, 400);
  }
  await answer(deps, url, exchange);
}

function readerHandler(deps: ServerDeps): (request: IncomingMessage, response: ServerResponse) => void {
  let active = 0;
  return (request, response) => {
    const path = (request.url ?? "").split("?")[0];
    if (path === "/health" && request.method === "GET") return void send(response, 200, '{"ok":true}');
    if (path !== "/card") return void send(response, 404);
    if (request.method !== "POST") return void send(response, 405);
    if (!(request.headers["content-type"] ?? "").startsWith("application/json")) return void send(response, 415);
    if (active >= deps.max) {
      deps.log({ kind: "busy" });
      return void send(response, 503);
    }
    active += 1;
    const left = new AbortController();
    response.once("close", () => {
      if (!response.writableFinished) left.abort();
    });
    card(deps, { request, response, left: left.signal })
      .catch(() => {
        deps.log({ kind: left.signal.aborted ? "gone" : "crash" });
      })
      .finally(() => {
        active -= 1;
      });
  };
}

/** The HTTP server: the handler with a header limit of 8 KiB and every service's timeouts (a slow client frees its place). */
export function readerServer(deps: ServerDeps): Server {
  return createServer({ ...serverOptions(), maxHeaderSize: 8192 }, readerHandler(deps));
}
