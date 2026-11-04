// jarvis's HTTP face (ADR-0002 §7, D42): on the network only it and the server share, the routes of its table and
// nothing else, every refusal a typed code, never a stack or what the request sent (D174). A POST is JSON of strict
// UTF-8, read up to 256 KiB before it is parsed; a handler gets a signal its client's leaving aborts. While jarvis
// stops, every request is not ready. Node's own server, with the server's timeouts (packages/service).
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { jsonOf } from "@gnoworld/core";
import type { ApiError } from "@gnoworld/schemas";
import { serverOptions } from "@gnoworld/service/http";
import type { Log } from "@gnoworld/service/log";

/** What a handler answers: a status, and the body written as JSON. */
interface Reply {
  readonly status: number;
  readonly body: unknown;
}
/** A route's handler: a POST's JSON (nothing for a GET), and the signal its client's leaving aborts. */
export type Handler = (body: unknown, signal: AbortSignal) => Promise<Reply>;
const METHODS = ["GET", "POST"] as const;
type Method = (typeof METHODS)[number];
export type Routes = Readonly<Record<string, Readonly<Partial<Record<Method, Handler>>>>>;

interface Options {
  readonly host: string;
  readonly port: number;
  readonly log: Log;
  // False once jarvis stops: every request is then not ready, its connection closed.
  readonly ready: () => boolean;
}
// A refusal this face makes itself, logged by its code; the methods a route takes; a connection to close after it.
type Made = Reply & { readonly refused?: ApiError["error"]; readonly allow?: string; readonly close?: boolean };

const MAX_BYTES = 256 * 1024;

/** A refusal, as an `ApiError` with its status. */
const refusal = (error: ApiError["error"], status: number): Reply => ({ status, body: { error } });
const refused = (error: ApiError["error"], status: number, more: { allow?: string; close?: boolean } = {}): Made => ({
  ...refusal(error, status),
  refused: error,
  ...more,
});

/** jarvis's routes, served where its settings say; `idle()` once every request in flight has ended. */
export async function serve(routes: Routes, options: Options) {
  const flight = new Set<Promise<void>>();
  const server = createServer(serverOptions(), (request, response) => {
    // handle answers every request itself, a fault included: it never rejects.
    const handled = handle({ routes, options }, request, response);
    const ended = (): void => {
      flight.delete(handled);
    };
    flight.add(handled);
    handled.then(ended, ended);
  });
  server.listen(options.port, options.host);
  await once(server, "listening");
  return {
    server,
    async idle(): Promise<void> {
      while (flight.size > 0) await Promise.allSettled(flight);
    },
  };
}

interface Asked {
  readonly route: Routes[string] | undefined;
  readonly method: Method | undefined;
  readonly ready: boolean;
}

async function handle(
  served: { routes: Routes; options: Options },
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { routes, options } = served;
  const left = new AbortController();
  response.on("close", () => {
    if (!response.writableFinished) left.abort();
  });
  const { asked, named } = askedOf(routes, request, options.ready());
  let reply: Made;
  try {
    reply = await replyOf(asked, request, left.signal);
  } catch (error) {
    if (left.signal.aborted) return;
    // Its name alone: a message may quote what the request sent.
    options.log("jarvis_failed", { ...named, status: 500, error: error instanceof Error ? error.name : typeof error });
    reply = refusal("internal", 500);
  }
  if (reply.refused !== undefined)
    options.log("jarvis_refused", { ...named, status: reply.status, error: reply.refused });
  written(response, reply, asked.ready);
}

// The route and method a request asks, and how the log names them: a path or a method of the client's as one word,
// as either could carry anything.
function askedOf(routes: Routes, request: IncomingMessage, ready: boolean) {
  const path = URL.parse(request.url ?? "", "http://jarvis")?.pathname ?? "";
  const route = Object.hasOwn(routes, path) ? routes[path] : undefined;
  const method = METHODS.find((known) => known === request.method);
  const asked: Asked = { route, method, ready };
  return { asked, named: { route: route === undefined ? "<unknown>" : path, method: method ?? "<other>" } };
}

// The answer as JSON, its connection closed once jarvis stops or the request's rest is left unread.
function written(response: ServerResponse, reply: Made, ready: boolean): void {
  if (response.destroyed) return;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    ...(ready && reply.close !== true ? {} : { connection: "close" }),
    ...(reply.allow === undefined ? {} : { allow: reply.allow }),
  };
  response.writeHead(reply.status, headers).end(JSON.stringify(reply.body));
}

async function replyOf({ route, method, ready }: Asked, request: IncomingMessage, signal: AbortSignal): Promise<Made> {
  if (!ready) return refused("not_ready", 503);
  if (route === undefined) return refused("not_found", 404);
  const handler = method === undefined ? undefined : route[method];
  if (handler === undefined) {
    return refused("unsupported", 405, { allow: METHODS.filter((known) => known in route).join(", ") });
  }
  if (method === "GET") return handler(undefined, signal);
  if (!isJson(request.headers["content-type"])) return refused("unsupported", 415);
  const text = await bodyOf(request);
  // The rest of the body is left unread, its connection closed once the refusal is written.
  if (text === undefined) return refused("too_large", 413, { close: true });
  const body = text === null ? undefined : jsonOf(text);
  if (body === undefined) return refused("refused", 400);
  return handler(body, signal);
}

// `application/json`, in any case, with any parameter.
const isJson = (type: string | undefined) => type?.split(";")[0]?.trim().toLowerCase() === "application/json";

// The body's text: undefined past 256 KiB, by its declared length before a byte is read, else once its bytes pass it,
// never waiting for its end; null for bytes that are no UTF-8.
function bodyOf(request: IncomingMessage): Promise<string | null | undefined> {
  if (Number(request.headers["content-length"] ?? "0") > MAX_BYTES) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const done = (text: string | null | undefined): void => {
      request.off("data", data).off("end", end).off("error", reject);
      resolve(text);
    };
    const data = (chunk: Buffer): void => {
      size += chunk.byteLength;
      if (size <= MAX_BYTES) chunks.push(chunk);
      else done(undefined);
    };
    const end = (): void => {
      done(decoded(Buffer.concat(chunks)));
    };
    request.on("data", data).on("end", end).on("error", reject);
  });
}

// Strict UTF-8, as JSON is: a byte that is none refuses the body.
function decoded(bytes: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
