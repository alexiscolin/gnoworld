import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { roomsApi } from "./rooms.ts";

const LIST = {
  world: "bubble",
  sections: [
    { name: "Talk", rooms: [{ room: "#bubble", type: "open" }] },
    { name: null, rooms: [{ room: "#bubble/games", type: "accounts" }] },
  ],
};
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
  return { api: roomsApi(fetcher), sent };
};

describe("a world's rooms, from the server", () => {
  it("asks GET /api/rooms for the world, the cookie to this site alone, no redirect followed, no body", async () => {
    const { api, sent } = server(json(200, LIST));
    expect(await api.rooms("bubble")).toEqual({ ok: true, value: LIST });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("/api/rooms?world=bubble");
    expect(sent[0]?.init).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
    expect(sent[0]?.init.body).toBeUndefined();
  });

  it("asks for any world a slug names, digits and hyphens included", async () => {
    const { api, sent } = server(json(200, { world: "my-world2", sections: [] }));
    expect(await api.rooms("my-world2")).toEqual({ ok: true, value: { world: "my-world2", sections: [] } });
    expect(sent[0]?.url).toBe("/api/rooms?world=my-world2");
  });

  it("takes 51 sections, the file's 50 and the others", async () => {
    const sections = [
      ...Array.from({ length: 50 }, (_, n) => ({ name: `s${String(n)}`, rooms: [] })),
      { name: null, rooms: [{ room: "#bubble", type: "open" }] },
    ];
    expect(await server(json(200, { world: "bubble", sections })).api.rooms("bubble")).toMatchObject({ ok: true });
  });

  it.each([
    "",
    "Bubble",
    "a/b",
    "../x",
    "bubble?x=1",
    "bubble&world=other",
    "-bubble",
    "a--b",
    "bubble-",
    "bu bble",
    "bübble",
    "%2e",
  ])("asks nothing for a world no slug names (%j)", async (world) => {
    const { api, sent } = server(json(200, LIST));
    expect(await api.rooms(world)).toEqual({ ok: false, reason: "malformed" });
    expect(sent).toHaveLength(0);
  });

  it.each([
    ["an answer naming another world", { ...LIST, world: "other" }],
    ["a room of another world", { ...LIST, sections: [{ name: null, rooms: [{ room: "#other", type: "open" }] }] }],
    [
      "a room of a world whose name starts the same",
      { ...LIST, sections: [{ name: null, rooms: [{ room: "#bubbles/x", type: "open" }] }] },
    ],
    ["a room id that is no room's", { ...LIST, sections: [{ name: null, rooms: [{ room: "bubble", type: "open" }] }] }],
    ["a type the server has none of", { ...LIST, sections: [{ name: null, rooms: [{ room: "#bubble", type: "x" }] }] }],
    [
      "a room of another world after the world's own",
      {
        ...LIST,
        sections: [
          LIST.sections[0],
          {
            name: null,
            rooms: [
              { room: "#bubble/a", type: "open" },
              { room: "#other/x", type: "open" },
            ],
          },
        ],
      },
    ],
    ["52 sections", { ...LIST, sections: Array.from({ length: 52 }, () => ({ name: null, rooms: [] })) }],
  ])("refuses %s", async (_, answer) => {
    expect(await server(json(200, answer)).api.rooms("bubble")).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    [json(404, { error: "not_found" }), "not_found"],
    [json(429, { error: "too_many" }), "too_many"],
    [{ status: 502 }, "unavailable"],
  ])("gives the server's reason for %j", async (answer, reason) => {
    expect(await server(answer).api.rooms("bubble")).toEqual({ ok: false, reason });
  });
});
