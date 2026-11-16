import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { sessionsApi } from "./sessions.ts";

const server = (status: number, json?: unknown) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = json === undefined ? null : JSON.stringify(json);
    return Promise.resolve(new Response(body, { status, headers: { "content-type": "application/json" } }));
  };
  return { api: sessionsApi(fetcher), sent };
};

describe("the sessions' call to the server", () => {
  it("logs out the other sessions: a POST of an empty JSON object, the server answering with no body", async () => {
    const { api, sent } = server(204);
    expect(await api.logoutOthers()).toEqual({ ok: true, value: undefined });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("/api/login/logout-others");
    expect(sent[0]?.init).toMatchObject({ method: "POST", body: "{}", credentials: "same-origin", redirect: "error" });
    expect(new Headers(sent[0]?.init.headers).get("content-type")).toBe("application/json");
  });

  it.each([
    [401, "unauthenticated"],
    [429, "too_many"],
  ])("gives back the server's %i as its reason, %s, with its body", async (status, error) => {
    expect(await server(status, { error }).api.logoutOthers()).toEqual({ ok: false, reason: error, body: { error } });
  });
});
