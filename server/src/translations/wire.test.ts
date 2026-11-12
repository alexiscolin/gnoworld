import { describe, expect, it } from "vitest";
import type { Said } from "../irc/link.ts";
import { Hono } from "hono";
import type { TranslationFlow } from "./flow.ts";
import { thenTranslations, translationsBoot } from "./wire.ts";

const ROUTES = { session: () => undefined, config: { trustedProxy: undefined, origins: [] }, log: () => undefined };
const SAID: Said = { room: "#bubble", account: "alice", msgid: "m1", text: "Hello" };

describe("what passes a line on to the translations", () => {
  it("hands it to the others first, then to the translations", () => {
    const order: string[] = [];
    thenTranslations(() => order.push("passed"), { heard: () => order.push("translations") })(SAID);
    expect(order).toEqual(["passed", "translations"]);
  });

  it("is the others alone where there are no translations", () => {
    const order: string[] = [];
    thenTranslations(() => order.push("passed"), undefined)(SAID);
    expect(order).toEqual(["passed"]);
  });
});

describe("the translations' boot", () => {
  it("expires nothing before the flow is attached, then what the flow says", () => {
    const boot = translationsBoot();
    expect(boot.expire(5)).toBe(0);
    boot.attach(
      { translations: { expire: (limit) => limit + 1 } as TranslationFlow, mayRead: () => true },
      new Hono(),
      ROUTES,
    );
    expect(boot.expire(5)).toBe(6);
  });

  it("answers an empty list at /api/translations while Jarvis is off, never a 404", async () => {
    const app = new Hono();
    translationsBoot().attach({ translations: undefined, mayRead: () => true }, app, ROUTES);
    const response = await app.request(
      "/api/translations?room=%23bubble&ids=m1&language=fr",
      {},
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ room: "#bubble", language: "fr", translations: [], pending: [] });
  });
});
