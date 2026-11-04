// What the door's translation and digest tests share (10k): two accounts with their sessions, the site, and the public
// app with the routes under test mounted where main mounts the door, a POST to it as a page sends one, and the log's
// lines, their time left out.
import { Address } from "@gnoworld/schemas";
import type { Hono } from "hono";
import { logger } from "@gnoworld/service/log";
import { makeApp } from "../app.ts";
import type { Guarded } from "../guard.ts";

export const DOOR = {
  origin: "https://gnoworld.test",
  pepper: "a-pepper-of-forty-characters-0123456789",
  anna: Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"),
  ben: Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv"),
  annaToken: "anna-token-of-forty-three-characters-000000",
  benToken: "ben-token-of-forty-three-characters-0000000",
  t0: Date.parse("2026-11-04T12:00:00.000Z"),
} as const;

/** The account of a session's token, for the two accounts. */
export const sessionOf = (token: string | undefined): Address | undefined =>
  token === DOOR.annaToken ? DOOR.anna : token === DOOR.benToken ? DOOR.ben : undefined;

interface Post {
  body?: unknown;
  token?: string | null;
  origin?: string | null;
  type?: string | null;
  signal?: AbortSignal;
}

/** The public app with `routes` at /api/jarvis, a POST to `path` there, and the log's lines. */
export function doorApp(routes: (log: ReturnType<typeof logger>) => Hono<Guarded>, path: string) {
  const lines: string[] = [];
  const log = logger(DOOR.pepper, (line) => lines.push(line));
  const app = makeApp(log, () => true);
  app.route("/api/jarvis", routes(log));
  const post = ({ body, token = DOOR.annaToken, origin = DOOR.origin, type = "application/json", signal }: Post) =>
    app.request(
      `/api/jarvis${path}`,
      {
        method: "POST",
        headers: {
          ...(origin === null ? {} : { origin }),
          ...(type === null ? {} : { "content-type": type }),
          ...(token === null ? {} : { cookie: `__Host-session=${token}` }),
        },
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
  const events = () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{"));
  return { post, events, raw: () => lines.join("") };
}

/** A response's status and body. */
export const answerOf = async (response: Response) => [response.status, await response.json()];
