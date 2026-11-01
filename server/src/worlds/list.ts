// The chain's realm list (slice 7, 7c): `vm/qpaths` with the prefix `gno.land/r/` answers the paths joined by a newline, sorted, with
// no metadata (handler.go:233 at v1.5.0). Its limit is 1,000 by default and 10,000 at most, and a limit over the cap is lowered,
// not refused, so a list of exactly the cap may be cut: it is refused as too many. What comes back is data: capped, and each
// line kept only if it is a realm path.
import { RealmPath } from "@gnoworld/schemas";
import { abciQuery, Failure, kindOf, type Kind, type Send } from "./remote.ts";

export const LIST_MAX_PATHS = 10_000;
export const LIST_MAX_BYTES = 1024 * 1024;
const LIST_MS = 30_000;

export type PathsRead = { ok: true; paths: string[] } | { ok: false; kind: Kind };

export async function readRealmPaths(reader: {
  send: Send;
  rpc: string;
  pace?: () => Promise<void>;
}): Promise<PathsRead> {
  try {
    await reader.pace?.();
    const text = await abciQuery(
      reader,
      { path: `vm/qpaths?limit=${String(LIST_MAX_PATHS)}`, data: "gno.land/r/" },
      { ms: LIST_MS, maxBytes: LIST_MAX_BYTES },
    );
    const lines = text.split("\n").filter((line) => line !== "");
    if (lines.length >= LIST_MAX_PATHS) throw new Failure("too_many");
    return { ok: true, paths: lines.filter((line) => RealmPath.safeParse(line).success) };
  } catch (error) {
    return { ok: false, kind: kindOf(error) };
  }
}
