// A realm's rollup as a query (slice 13a, 13): kept, so a plate seen again draws it at once and reads it again quietly, and a link's hover or the
// idle batch asks it ahead (plateWarm.ts). The reader and its schema come in a chunk of their own: a first screen holds neither. A rollup that did
// not come whole is no answer, and leaves the last good one.
import { queryOptions } from "@tanstack/react-query";
import { Unread } from "../query/client.ts";
import { pageFetch } from "../query/policy.ts";
import { keys } from "../query/keys.ts";

export const rollupOptions = (base: string, realm: string) =>
  queryOptions({
    queryKey: keys.rollup(base, realm),
    queryFn: async ({ signal }) => {
      const rollup = await import("./rollup.ts").then(({ readRollup }) =>
        readRollup(base, realm, { fetch: pageFetch, signal }),
      );
      if (rollup === undefined) throw new Unread(undefined);
      return rollup;
    },
  });
