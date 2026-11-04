import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Address, toAddress } from "@gnoworld/schemas";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { LOGIN_TABLES } from "./login.ts";
import { makeTickets, TICKET_TABLES } from "./ticket.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const SECOND = 1000;
const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = Address.parse(toAddress(new Uint8Array(20).fill(7)));

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = () => {
  const db = openDatabase(":memory:", [LOGIN_TABLES, TICKET_TABLES]);
  opened.push(db);
  for (const address of [ME, OTHER])
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(address, T0);
  const clock = { now: T0 };
  return { db, clock, tickets: makeTickets(db, { now: () => clock.now }) };
};

describe("tickets", () => {
  it("mints 256 random bits, of which only the SHA-256 is stored, a new one each time", () => {
    const { db, tickets } = setup();
    const [first, second] = [tickets.mint(ME), tickets.mint(ME)];
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    const stored = db.prepare("SELECT hex(hash) AS hash, address, expires_at FROM tickets ORDER BY expires_at").all();
    const sha = (ticket: string): string => createHash("sha256").update(ticket).digest("hex").toUpperCase();
    expect(stored).toEqual(
      expect.arrayContaining([
        { hash: sha(first), address: ME, expires_at: T0 + 60 * SECOND },
        { hash: sha(second), address: ME, expires_at: T0 + 60 * SECOND },
      ]),
    );
    expect(JSON.stringify(db.prepare("SELECT * FROM tickets").all())).not.toContain(first);
  });

  it.each([
    [59 * SECOND, ME],
    [60 * SECOND - 1, ME],
    [60 * SECOND, undefined],
    [61 * SECOND, undefined],
  ])("redeemed %i ms after its mint, logs in as %s", (after, expected) => {
    const { clock, tickets } = setup();
    const ticket = tickets.mint(ME);
    clock.now += after;
    expect(tickets.redeem(ticket, ME)).toBe(expected);
  });

  it("is used once: a second redemption is refused", () => {
    const { tickets } = setup();
    const ticket = tickets.mint(ME);
    expect(tickets.redeem(ticket, ME)).toBe(ME);
    expect(tickets.redeem(ticket, ME)).toBeUndefined();
  });

  it("refuses an unknown ticket, and another account's", () => {
    const { tickets } = setup();
    expect(tickets.redeem("A".repeat(43), ME)).toBeUndefined();
    const ticket = tickets.mint(OTHER);
    expect(tickets.redeem(ticket, ME)).toBeUndefined();
  });

  it("is spent by a try with another account, so it cannot be tried again", () => {
    const { tickets } = setup();
    const ticket = tickets.mint(ME);
    expect(tickets.redeem(ticket, OTHER)).toBeUndefined();
    expect(tickets.redeem(ticket, ME)).toBeUndefined();
  });

  it("never reads the database for an account that is not a canonical address", () => {
    const { tickets } = setup();
    const ticket = tickets.mint(ME);
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.constantFrom(ME.toUpperCase(), ` ${ME}`, `${ME} `, `${ME}\n`, ME.slice(0, -1), `${ME.slice(0, -1)}q`),
        ),
        (account) => {
          fc.pre(account !== ME);
          expect(tickets.redeem(ticket, account)).toBeUndefined();
        },
      ),
    );
    // Not spent by any of those tries: none reached the row.
    expect(tickets.redeem(ticket, ME)).toBe(ME);
  });

  it("purges the expired tickets at the next mint, and only those", () => {
    const { db, clock, tickets } = setup();
    tickets.mint(ME);
    clock.now += 30 * SECOND;
    const live = tickets.mint(ME);
    clock.now += 30 * SECOND;
    tickets.mint(OTHER);
    expect(db.prepare("SELECT count(*) AS n FROM tickets").get()).toEqual({ n: 2 });
    expect(tickets.redeem(live, ME)).toBe(ME);
  });
});
