// Ergo's auth script, answered by the server (ADR-0002 §7; slice 3's plan, 3d). Ergo writes one JSON line,
// the SASL account and a ticket as its passphrase, and reads one line back (irc/authscript.go). A ticket is
// spent whatever the answer; failures count per visitor, never per account, so nobody locks another out.
import { once } from "node:events";
import { lstatSync, unlinkSync } from "node:fs";
import { createServer, isIP, type Server } from "node:net";
import type { DatabaseSync } from "node:sqlite";
import { Address } from "@gnoworld/schemas";
import { z } from "zod";
import { limiter } from "../limit.ts";
import type { Log } from "../log.ts";
import { makeTickets } from "../login/ticket.ts";
import { visitor } from "../visitor.ts";

type Outcome = { address: Address } | { error: "frame" | "limit" | "account" | "ticket" | "failed" };

interface Options {
  log: Log;
  now?: () => number;
  // From the connection on, whatever arrives: Ergo writes its line at once.
  deadlineMs?: number;
}

export function authServer(db: DatabaseSync, { log, now = Date.now, deadlineMs = 5000 }: Options): Server {
  const tickets = makeTickets(db, { now });
  const failures = limiter({ max: 10, windowMs: 60_000, keys: 100_000 });
  // Ergo adds fields the server never reads: a certificate, the WebSocket upgrade's cookies.
  const Input = z.object({ accountName: z.string(), passphrase: z.string(), ip: z.string().optional() });
  const lineMax = 16 * 1024;

  const check = (line: string): Outcome => {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return { error: "frame" };
    }
    const input = Input.safeParse(json);
    if (!input.success) return { error: "frame" };
    const { accountName, passphrase, ip } = input.data;
    // Ergo leaves the address out when it has none: those lines share one count, as does any ip that is
    // no address, which would otherwise be a key as long as the line.
    const who = ip === undefined || isIP(ip) === 0 ? "" : visitor(ip, undefined, undefined);
    const at = now();
    if (failures.full(who, at)) return { error: "limit" };
    let outcome: Outcome = { error: "account" };
    if (Address.safeParse(accountName).success) {
      const address = tickets.redeem(passphrase, accountName);
      outcome = address === undefined ? { error: "ticket" } : { address };
    }
    if ("error" in outcome) failures.take(who, at);
    return outcome;
  };

  // The socket's boundary, where the HTTP side has onError: a database that fails refuses the login,
  // and the process, the API with it, stays up.
  const attempt = (line: string): Outcome => {
    try {
      return check(line);
    } catch {
      return { error: "failed" };
    }
  };

  return createServer((socket) => {
    let held = Buffer.alloc(0);
    let answered = false;
    const deadline = setTimeout(() => socket.destroy(), deadlineMs);
    const answer = (outcome: Outcome): void => {
      answered = true;
      if ("error" in outcome) log("irc_login_refused", outcome);
      else log("irc_login", { account: outcome.address });
      const output = "error" in outcome ? { success: false } : { success: true, accountName: outcome.address };
      socket.end(`${JSON.stringify(output)}\n`);
    };
    socket.on("data", (chunk: Buffer) => {
      if (answered) return;
      // ponytail: the line rebuilt at each chunk, O(L²/k), L ≤ 16 KiB: 6 ms at most, from one-byte chunks,
      // which only the socket's peer sends (Ergo writes its line at once); a chunk list if another peer comes.
      held = Buffer.concat([held, chunk]);
      const end = held.indexOf(10);
      if (end === -1 ? held.length > lineMax : end > lineMax) answer({ error: "frame" });
      else if (end !== -1) answer(attempt(held.subarray(0, end).toString("utf8")));
    });
    // A frame cut before its end of line is refused, however whole it looks.
    socket.on("end", () => {
      if (!answered) answer({ error: "frame" });
    });
    // A reset as the answer goes out: Node destroys the socket, and nobody is left to answer.
    socket.on("error", () => undefined);
    socket.on("close", () => {
      clearTimeout(deadline);
    });
  });
}

// The socket Ergo dials, where a crash may have left the last one: only a socket is removed, never a file.
export async function listenAt(server: Server, path: string): Promise<void> {
  try {
    if (lstatSync(path, { throwIfNoEntry: false })?.isSocket() === true) unlinkSync(path);
    server.listen(path);
    await once(server, "listening");
  } catch (error) {
    throw new Error("setting AUTH_SOCKET: the server cannot listen there", { cause: error });
  }
}
