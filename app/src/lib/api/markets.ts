// The browser's one read of markets.json, the file the server's timer writes and the web container serves at /markets.json
// (slice 5 part 2, 5l and 5m). A state, never an exception: the file missing is not the file broken, and nothing the file
// held is kept when its shape is refused. One GET, a time limit over the body too, a size cap, no timer left behind.
import { Markets } from "@gnoworld/schemas";
import { TIMEOUT_MS, type Fetcher } from "./http.ts";

/** The most bytes the file may weigh; it holds three tokens, about 300 B. */
export const MARKETS_MAX_BYTES = 16 * 1024;

export type MarketsRead =
  { ok: true; markets: Markets } | { ok: false; reason: "missing" | "unavailable" | "network" | "malformed" };

type Failure = Extract<MarketsRead, { ok: false }>;
const failed = (reason: Failure["reason"]): Failure => ({ ok: false, reason });

// The body as text; a body past the cap stops the read and is a RangeError.
async function textOf(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    total += value.byteLength;
    if (total > MARKETS_MAX_BYTES) {
      await reader.cancel();
      throw new RangeError("markets.json is over its cap");
    }
    text += decoder.decode(value, { stream: true });
  }
}

async function attempt(fetcher: Fetcher, signal: AbortSignal): Promise<MarketsRead> {
  let response: Response;
  try {
    response = await fetcher("/markets.json", { method: "GET", credentials: "same-origin", redirect: "error", signal });
  } catch {
    return failed("network");
  }
  if (response.status === 404) return failed("missing");
  if (response.status !== 200) return failed("unavailable");
  let text: string;
  try {
    text = await textOf(response);
  } catch (cause) {
    return failed(cause instanceof RangeError ? "malformed" : "network");
  }
  try {
    const parsed = Markets.safeParse(JSON.parse(text));
    return parsed.success ? { ok: true, markets: parsed.data } : failed("malformed");
  } catch {
    return failed("malformed");
  }
}

/** One read of /markets.json; `signal` ends it early (a page that left), and the limit ends it when the server stalls. */
export async function readMarkets(
  fetcher: Fetcher = (url, init) => fetch(url, init),
  { signal, timeoutMs = TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<MarketsRead> {
  if (signal?.aborted === true) return failed("network");
  const controller = new AbortController();
  const stop = () => {
    controller.abort(signal?.reason);
  };
  const ended = new Promise<Failure>((resolve) => {
    controller.signal.addEventListener("abort", () => {
      resolve(failed("network"));
    });
  });
  signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException("markets.json took too long", "TimeoutError"));
  }, timeoutMs);
  try {
    return await Promise.race([attempt(fetcher, controller.signal), ended]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}
