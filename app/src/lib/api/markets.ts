// The browser's one read of markets.json, the file the server's timer writes and the web container serves at /markets.json
// (slice 5 part 2, 5l and 5m). A state, never an exception: the file missing is not the file broken, and nothing the file
// held is kept when its shape is refused. One GET, a time limit over the body too, a size cap, no timer left behind.
import { Markets } from "@gnoworld/schemas";
import { fetchBytes } from "@gnoworld/chain/transport";
import type { Fetcher } from "./http.ts";

/** The most bytes the file may weigh; it holds three tokens, about 300 B. */
export const MARKETS_MAX_BYTES = 16 * 1024;

export type MarketsRead =
  { ok: true; markets: Markets } | { ok: false; reason: "missing" | "unavailable" | "network" | "malformed" };

type Failure = Extract<MarketsRead, { ok: false }>;
const failed = (reason: Failure["reason"]): Failure => ({ ok: false, reason });

// The file's state from the transport's: no answer is the network, a 404 the file missing, any other status unavailable.
function reasonOf({ kind, status }: { kind: string; status?: number }): Failure["reason"] {
  if (kind === "too-big") return "malformed";
  if (status === undefined) return "network";
  return status === 404 ? "missing" : "unavailable";
}

/** One read of /markets.json, on the chain reads' transport: `signal` ends it early (a page that left), and the limit ends it when the server stalls. */
export async function readMarkets(
  fetcher: Fetcher = (url, init) => fetch(url, init),
  { signal, timeoutMs }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<MarketsRead> {
  const fetched = await fetchBytes("/markets.json", {
    fetch: fetcher,
    credentials: "same-origin",
    maxBytes: MARKETS_MAX_BYTES,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(signal === undefined ? {} : { signal }),
  });
  if ("kind" in fetched) return failed(reasonOf(fetched));
  if (fetched.status !== 200) return failed("unavailable");
  try {
    const parsed = Markets.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fetched.bytes)));
    return parsed.success ? { ok: true, markets: parsed.data } : failed("malformed");
  } catch {
    return failed("malformed");
  }
}
