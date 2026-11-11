import { logger } from "@gnoworld/service/log";
import { describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { DOOR } from "../testing/door.ts";
import { stateRoutes } from "./state.ts";

// 10u-a: GET /api/jarvis/state, whether Jarvis is on, from the door's switch alone: no session, no model, no jarvis called.
const setup = (on: boolean) => {
  const lines: string[] = [];
  const app = makeApp(
    logger(DOOR.pepper, (line) => lines.push(line)),
    () => true,
  );
  app.route("/api/jarvis", stateRoutes({ on }));
  const get = (init: RequestInit = {}, path = "/api/jarvis/state") =>
    app.request(path, init, { incoming: { socket: { remoteAddress: "203.0.113.7" } } });
  return { get, lines };
};
const body = async (response: Response) => [response.status, await response.json()];

describe("the door's state", () => {
  it("answers on: true to a page with no session when the switch is on", async () => {
    expect(await body(await setup(true).get())).toEqual([200, { on: true }]);
  });

  it("answers on: false when the switch is off, and still 200", async () => {
    expect(await body(await setup(false).get())).toEqual([200, { on: false }]);
  });

  it("is never cached, and a session cookie changes nothing", async () => {
    const response = await setup(true).get({ headers: { cookie: `__Host-session=${DOOR.annaToken}` } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ on: true });
  });

  it("answers only a GET: a POST is no route", async () => {
    expect(
      (
        await setup(true).get({
          method: "POST",
          headers: { origin: DOOR.origin, "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(404);
  });

  it("answers nothing but the state: no question, no reason, no budget", async () => {
    expect(Object.keys((await (await setup(true).get()).json()) as object)).toEqual(["on"]);
  });
});
