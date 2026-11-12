// A file the server's jobs write, read on the page's own fetch for a query: one that did not come whole throws an `Unread`, so the last good one stays.
import { readSiteFile } from "@gnoworld/chain/transport";
import type * as z from "zod/mini";
import { Unread } from "./client.ts";
import { pageFetch } from "./policy.ts";

/** The file at `url` as `schema` reads it, under `maxBytes`. */
export async function readPageFile<T>(
  url: string,
  schema: z.ZodMiniType<T>,
  { maxBytes, signal }: { maxBytes: number; signal: AbortSignal },
): Promise<T> {
  const file = await readSiteFile(url, schema, { maxBytes, fetch: pageFetch, signal });
  if (file === undefined) throw new Unread(undefined);
  return file;
}
