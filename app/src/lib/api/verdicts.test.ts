import { VERDICTS_ASKED } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { verdictsApi } from "./verdicts.ts";

const json = (status: number, value?: unknown) => ({ status, json: value });

// A server that answers as told, and keeps what it was asked.
const server = (answer: { status: number; json?: unknown }) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = answer.json === undefined ? null : JSON.stringify(answer.json);
    return Promise.resolve(
      new Response(body, { status: answer.status, headers: { "content-type": "application/json" } }),
    );
  };
  return { api: verdictsApi(fetcher), sent };
};
const ANSWER = { room: "#bubble/games", verdicts: [{ msgid: "m1", state: "checked" }] };

// 4g (docs/decisions.md, 2026-10-26): the verdicts of lines older than the stream's replay, asked of the server.
describe("the lines' verdicts, from the server", () => {
  it("asks GET /api/verdicts for the room and the ids, encoded, the cookie to this site alone, no body", async () => {
    const { api, sent } = server(json(200, ANSWER));
    expect(await api.verdicts("#bubble/games", ["m1", "m2"])).toEqual({ ok: true, value: ANSWER });
    expect(sent[0]?.url).toBe("/api/verdicts?room=%23bubble%2Fgames&ids=m1%2Cm2");
    expect(sent[0]?.init).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
    expect(sent[0]?.init.body).toBeUndefined();
  });

  it(`asks nothing for no line, nor for more than ${String(VERDICTS_ASKED)}, which the server refuses`, async () => {
    const { api, sent } = server(json(200, ANSWER));
    expect(await api.verdicts("#bubble", [])).toEqual({ ok: false, reason: "refused" });
    const many = Array.from({ length: VERDICTS_ASKED + 1 }, (_, n) => `m${String(n)}`);
    expect(await api.verdicts("#bubble", many)).toEqual({ ok: false, reason: "refused" });
    expect(sent).toEqual([]);
  });

  it(`asks for ${String(VERDICTS_ASKED)} lines at once`, async () => {
    const { api, sent } = server(json(200, { room: "#bubble", verdicts: [] }));
    const all = Array.from({ length: VERDICTS_ASKED }, (_, n) => `m${String(n)}`);
    expect(await api.verdicts("#bubble", all)).toEqual({ ok: true, value: { room: "#bubble", verdicts: [] } });
    expect(sent).toHaveLength(1);
  });

  // Data from the server goes through Zod; and it must answer what was asked.
  it.each([
    ["another room", { ...ANSWER, room: "#garden" }],
    ["a line not asked", { ...ANSWER, verdicts: [{ msgid: "m9", state: "checked" }] }],
    [
      "a line asked beside one not",
      {
        ...ANSWER,
        verdicts: [
          { msgid: "m1", state: "checked" },
          { msgid: "m9", state: "hidden" },
        ],
      },
    ],
    ["a state it does not know", { ...ANSWER, verdicts: [{ msgid: "m1", state: "pending" }] }],
    ["a field more", { ...ANSWER, extra: 1 }],
    ["no list", { room: "#bubble/games" }],
  ])("takes no answer of %s", async (_, answer) => {
    const { api } = server(json(200, answer));
    expect(await api.verdicts("#bubble/games", ["m1", "m2"])).toEqual({ ok: false, reason: "malformed" });
  });

  it("hands on the server's refusal as its reason", async () => {
    const { api } = server(json(403, { error: "forbidden" }));
    expect(await api.verdicts("#bubble/crew", ["m1"])).toEqual({
      ok: false,
      reason: "forbidden",
      body: { error: "forbidden" },
    });
  });
});
