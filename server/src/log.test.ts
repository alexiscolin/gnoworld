import { createHmac } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { logger } from "./log.ts";

const PEPPER = "a-pepper-of-forty-characters-0123456789";
const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const Line = z.looseObject({ time: z.iso.datetime(), event: z.string() });

const capture = (pepper = PEPPER): { log: ReturnType<typeof logger>; lines: string[] } => {
  const lines: string[] = [];
  return { log: logger(pepper, (line) => lines.push(line)), lines };
};

describe("logger", () => {
  it("writes one JSON line per event, with its time and its fields", () => {
    const { log, lines } = capture();
    log("listening", { port: 8080 });
    log("failed", { method: "GET", route: "/health", status: 500, error: "TypeError" });
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.endsWith("}\n") && !line.slice(0, -1).includes("\n"))).toBe(true);
    expect(Line.parse(JSON.parse(lines[0] ?? ""))).toMatchObject({ event: "listening", port: 8080 });
    expect(Line.parse(JSON.parse(lines[1] ?? ""))).toMatchObject({
      event: "failed",
      method: "GET",
      route: "/health",
      status: 500,
      error: "TypeError",
    });
  });

  it("writes a room as it is, before the account: a room's name is public (3l)", () => {
    const { log, lines } = capture();
    log("room_made", { room: "#bubble/garden", account: ADDRESS });
    expect(lines[0]?.replace(/^\{"time":"[^"]+",/, "{")).toBe(
      `{"event":"room_made","room":"#bubble/garden","account":"${createHmac("sha256", PEPPER).update(ADDRESS).digest("hex")}"}\n`,
    );
  });

  it("writes a line's id as it is, with its room, before the account: Ergo's id is every reader's", () => {
    const { log, lines } = capture();
    log("pin_added", { room: "#bubble/games", msgid: "abc123", account: ADDRESS });
    expect(lines[0]?.replace(/^\{"time":"[^"]+",/, "{")).toBe(
      `{"event":"pin_added","room":"#bubble/games","msgid":"abc123","account":"${createHmac("sha256", PEPPER).update(ADDRESS).digest("hex")}"}\n`,
    );
  });

  it("writes an account only as its HMAC with the pepper", () => {
    const { log, lines } = capture();
    log("login", { account: ADDRESS });
    log("login", { account: ADDRESS });
    log("login", { account: "g1other" });
    const other = capture("another-pepper-of-forty-characters-01234");
    other.log("login", { account: ADDRESS });

    const accounts = [...lines, ...other.lines].map(
      (line) => z.object({ account: z.string() }).loose().parse(JSON.parse(line)).account,
    );
    expect(lines.join("")).not.toContain(ADDRESS);
    expect(accounts[0]).toBe(createHmac("sha256", PEPPER).update(ADDRESS).digest("hex"));
    expect(accounts[1]).toBe(accounts[0]);
    expect(accounts[2]).not.toBe(accounts[0]);
    // Without the pepper, the same address gives another hash: a list of addresses cannot be matched to the logs.
    expect(accounts[3]).not.toBe(accounts[0]);
  });

  it("writes a duration in milliseconds as a number", () => {
    const { log, lines } = capture();
    log("moderation_backlog", { ms: 30_000 });
    expect(Line.parse(JSON.parse(lines[0] ?? ""))).toMatchObject({ event: "moderation_backlog", ms: 30_000 });
  });

  it("writes only its own fields, whatever an object passed in carries", () => {
    const { log, lines } = capture();
    const request = { route: "/login", token: "planted-token", ticket: "planted-ticket", signature: "planted-sig" };
    log("login", request);
    expect(lines.join("")).not.toContain("planted-");
    expect(Line.parse(JSON.parse(lines[0] ?? ""))).toMatchObject({ route: "/login" });
  });

  it("keeps one parseable line per event, whatever the strings hold", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (event, route) => {
        const { log, lines } = capture();
        log(event, { route });
        expect(lines).toHaveLength(1);
        expect(lines[0]?.indexOf("\n")).toBe((lines[0]?.length ?? 0) - 1);
        expect(Line.parse(JSON.parse(lines[0] ?? ""))).toMatchObject({ event, route });
      }),
    );
  });
});
