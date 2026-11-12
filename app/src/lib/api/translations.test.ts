import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { translationsApi } from "./translations.ts";

// The browser's client of the stored translations (server/src/translations/routes.ts): at most 30 lines an ask, every answer through its
// schema and naming what was asked alone.
const server = (answer: { status: number; json?: unknown }) => {
  const sent: string[] = [];
  const fetcher: Fetcher = (url) => {
    sent.push(url);
    return Promise.resolve(
      new Response(answer.json === undefined ? null : JSON.stringify(answer.json), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { api: translationsApi(fetcher), sent };
};
const ANSWER = {
  room: "#bubble",
  language: "fr",
  translations: [{ msgid: "m1", status: "translated", text: "Bonjour" }],
  pending: ["m2"],
};

describe("the translations' client", () => {
  it("asks the room, the lines and the language, and returns the answer", async () => {
    const t = server({ status: 200, json: ANSWER });
    const result = await t.api.lines("#bubble", ["m1", "m2"], "fr");
    expect(result).toEqual({ ok: true, value: ANSWER });
    expect(t.sent).toEqual(["/api/translations?room=%23bubble&ids=m1%2Cm2&language=fr"]);
  });

  it("refuses before sending no line, more than 30, an id with a space and a language off the list", async () => {
    const t = server({ status: 200, json: ANSWER });
    const many = Array.from({ length: 31 }, (_, at) => `m${String(at)}`);
    for (const [ids, language] of [
      [[], "fr"],
      [many, "fr"],
      [["m 1"], "fr"],
      [["m1"], "xx"],
    ] as const)
      expect(await t.api.lines("#bubble", ids, language)).toEqual({ ok: false, reason: "refused" });
    expect(t.sent).toEqual([]);
  });

  it("refuses an answer for another room or language, or naming a line not asked, as malformed", async () => {
    for (const json of [
      { ...ANSWER, room: "#other" },
      { ...ANSWER, language: "de" },
      { ...ANSWER, translations: [{ msgid: "zz", status: "original" }] },
      { ...ANSWER, pending: ["zz"] },
      { ...ANSWER, extra: 1 },
    ])
      expect(await server({ status: 200, json }).api.lines("#bubble", ["m1", "m2"], "fr")).toEqual({
        ok: false,
        reason: "malformed",
      });
  });

  it("passes a refusal on", async () => {
    expect((await server({ status: 429, json: { error: "too_many" } }).api.lines("#bubble", ["m1"], "fr")).ok).toBe(
      false,
    );
  });
});
