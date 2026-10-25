// JSON lines on stdout, which the log backend reads (ADR-0002 §7). A line holds only the fields named
// here, so what a request carried has nowhere to go; an account is written as its HMAC with the pepper.
import { createHmac } from "node:crypto";

interface Fields {
  account?: string;
  method?: string;
  route?: string;
  status?: number;
  port?: number;
  error?: string;
  ms?: number;
  // A room's name, which is public.
  room?: string;
}
export type Log = (event: string, fields?: Fields) => void;

export function logger(pepper: string, write: (line: string) => void): Log {
  return (event, { account, method, route, status, port, error, ms, room } = {}) => {
    const hashed = account === undefined ? undefined : createHmac("sha256", pepper).update(account).digest("hex");
    const line = {
      time: new Date().toISOString(),
      event,
      method,
      route,
      status,
      port,
      error,
      ms,
      room,
      account: hashed,
    };
    write(`${JSON.stringify(line)}\n`);
  };
}
