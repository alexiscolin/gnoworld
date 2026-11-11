// The reader's HTTP side (docs/plans/link-previews.md §3 step 3): `POST /card {url}` answers a `ReaderCard`, or 422 `{error: kind}`;
// at most `max` reads at once, else 503; `GET /health` for the container's check. Nothing else.
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { ReaderCard } from "@gnoworld/schemas";
import { z } from "zod";
import { Refused } from "./fetch.ts";
import type { Kind } from "./fetch.ts";

const BODY_MAX = 4096;
const Ask = z.strictObject({ url: z.string() });

export interface ServerDeps {
  read: (url: string) => Promise<ReaderCard>;
  max: number;
  /** One line per failure: its kind alone, never the URL. */
  log: (entry: { kind: Kind | "bad_request" | "busy" | "crash" }) => void;
}

const send = (response: ServerResponse, status: number, body = "") =>
  response
    .writeHead(status, { "content-type": "application/json", "cache-control": "no-store", connection: "close" })
    .end(body);

// The body, or undefined past the cap (declared or counted: a chunked body names no length).
async function bodyOf(request: IncomingMessage): Promise<string | undefined> {
  if (Number(request.headers["content-length"] ?? 0) > BODY_MAX) return undefined;
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of request as AsyncIterable<Buffer>) {
    size += part.length;
    if (size > BODY_MAX) return undefined;
    parts.push(part);
  }
  return Buffer.concat(parts).toString("utf8");
}

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

// The answer to one page: its card, the kind of its refusal (422), or nothing at all (500).
async function answer({ read, log }: ServerDeps, url: string, response: ServerResponse): Promise<void> {
  try {
    send(response, 200, JSON.stringify(await read(url)));
  } catch (error) {
    const kind = error instanceof Refused ? error.kind : "crash";
    log({ kind });
    send(
      response,
      error instanceof Refused ? 422 : 500,
      error instanceof Refused ? JSON.stringify({ error: kind }) : "",
    );
  }
}

async function card(deps: ServerDeps, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const text = await bodyOf(request);
  if (text === undefined) return void send(response, 413);
  const url = urlOf(text);
  if (url === undefined) {
    deps.log({ kind: "bad_request" });
    return void send(response, 400);
  }
  await answer(deps, url, response);
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
    card(deps, request, response)
      .catch(() => {
        deps.log({ kind: "crash" });
      })
      .finally(() => {
        active -= 1;
      });
  };
}

/** The HTTP server: the handler with a header limit of 8 KiB, 5 s for the headers and 10 s for a whole request (a slow client frees its place). */
export function readerServer(deps: ServerDeps): Server {
  return createServer({ headersTimeout: 5000, requestTimeout: 10_000, maxHeaderSize: 8192 }, readerHandler(deps));
}
