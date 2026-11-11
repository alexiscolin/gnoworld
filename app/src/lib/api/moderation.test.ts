import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { moderationApi } from "./moderation.ts";

// The browser's client of an owner's moderation (server/src/moderation/routes.ts, mounted at /api/moderation).
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const server = (answer: { status: number; json?: unknown }) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = answer.json === undefined ? null : JSON.stringify(answer.json);
    return Promise.resolve(
      new Response(body, { status: answer.status, headers: { "content-type": "application/json" } }),
    );
  };
  return { api: moderationApi(fetcher), sent };
};
const bodyOf = (call: { init: RequestInit } | undefined): unknown =>
  typeof call?.init.body === "string" ? JSON.parse(call.init.body) : undefined;

describe("an owner's moderation, from the server", () => {
  it("POSTs the room and the line's ids, in one request, to hide it, the cookie to this site alone", async () => {
    const { api, sent } = server({ status: 200, json: { ok: true } });
    expect(await api.hide("#bubble/games", ["m1", "m2"])).toEqual({ ok: true, value: { ok: true } });
    expect(sent[0]?.url).toBe("/api/moderation/hide");
    expect(sent[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error" });
    expect(bodyOf(sent[0])).toEqual({ room: "#bubble/games", msgids: ["m1", "m2"] });
  });

  it("POSTs the room and the account to mute it", async () => {
    const { api, sent } = server({ status: 200, json: { ok: true } });
    expect(await api.mute("#bubble/games", ALICE)).toEqual({ ok: true, value: { ok: true } });
    expect(sent[0]?.url).toBe("/api/moderation/mute");
    expect(bodyOf(sent[0])).toEqual({ room: "#bubble/games", account: ALICE });
  });

  it("sends nothing for a room, a line or an account that is none", async () => {
    const { api, sent } = server({ status: 200, json: { ok: true } });
    expect(await api.hide("no room", ["m1"])).toEqual({ ok: false, reason: "refused" });
    expect(await api.hide("#bubble", [""])).toEqual({ ok: false, reason: "refused" });
    expect(await api.hide("#bubble", [])).toEqual({ ok: false, reason: "refused" });
    expect(await api.hide("#bubble", ["m1", "m2", "m3"])).toEqual({ ok: false, reason: "refused" });
    expect(await api.hide("#bubble", ["m1", "m1"])).toEqual({ ok: false, reason: "refused" });
    expect(await api.mute("#bubble", "nobody")).toEqual({ ok: false, reason: "refused" });
    expect(sent).toHaveLength(0);
  });

  it.each([{ ok: false }, {}, { ok: "yes" }])("refuses the answer %j", async (json) => {
    expect(await server({ status: 200, json }).api.hide("#bubble", ["m1"])).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    [403, "forbidden"],
    [400, "refused"],
    [429, "too_many"],
    [503, "not_ready"],
    [409, "full"],
    [401, "unauthenticated"],
  ] as const)("reads a %i as %s", async (status, error) => {
    expect(await server({ status, json: { error } }).api.mute("#bubble", ALICE)).toMatchObject({
      ok: false,
      reason: error,
    });
  });
});
