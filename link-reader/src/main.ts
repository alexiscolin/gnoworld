// The link reader's process: LINKS_LISTEN (host:port), LINKS_PROXY (host:port of the link way out), LINKS_MAX; LINKS_DIRECT=1 for development.
import { lookup } from "node:dns/promises";
import { stop } from "@gnoworld/service/http";
import { CARD_MS, readCard } from "./card.ts";
import { readSettings } from "./config.ts";
import { readerServer } from "./server.ts";
import { directTransport, proxyTransport } from "./transport.ts";

const settings = readSettings(process.env);
// Behind the way out the name is resolved and checked there; the reader has no DNS of its own (its networks are internal).
const ways =
  settings.proxy === undefined
    ? {
        transport: directTransport(),
        lookup: async (host: string) => (await lookup(host, { all: true })).map((found) => found.address),
      }
    : { transport: proxyTransport(settings.proxy), lookup: undefined };
// One picture decoded at a time: the container's memory holds one.
const turns = { last: Promise.resolve() };
const hold = <T>(job: () => Promise<T>): Promise<T> => {
  const run = turns.last.then(job);
  turns.last = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};
const log = (entry: Record<string, string>) => {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
};
const server = readerServer({
  read: (url, signal) => readCard(url, { ...ways, hold, signal, log }),
  max: settings.max,
  log,
});
server.listen(settings.port, settings.host);
// The reads in flight end within a card's time; what still stalls then is cut, before the runtime's SIGKILL at 10 s.
process.once("SIGTERM", () => {
  stop(server, () => process.exit(0), CARD_MS + 1000);
});
