// The worlds' file (slice-7 §3): the site's own, the server's job writes it from the chain, so its answer passes a size cap and the schema
// before anything reads it. A read that fails is no worlds, never a throw: the cosmos keeps its fixed places and the page its list.
import { Worlds, WORLDS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { fetchBytes, type ChainFetch } from "./transport.ts";

/** Under the site's base. */
export const WORLDS_URL = "worlds.json";

interface WorldsRead {
  fetch?: ChainFetch;
  signal?: AbortSignal;
}

/** The file served under `base`, or nothing if it did not come whole. */
export async function readWorlds(base: string, { fetch, signal }: WorldsRead = {}): Promise<Worlds | undefined> {
  const answer = await fetchBytes(`${base}${WORLDS_URL}`, {
    ...(fetch === undefined ? {} : { fetch }),
    ...(signal === undefined ? {} : { signal }),
    maxBytes: WORLDS_MAX_BYTES,
    credentials: "same-origin",
  });
  if ("kind" in answer) return undefined;
  try {
    return Worlds.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(answer.bytes))).data;
  } catch {
    return undefined;
  }
}
