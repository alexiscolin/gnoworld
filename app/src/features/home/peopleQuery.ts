// The server's people online as a query (8i): the hero's count and the Earth's countries read one file, and one request, kept. The server counts
// again at most once a minute, so a page open asks as often, never while its tab is hidden (the query's own interval). The reader is a chunk of its
// own: the first screen holds neither the schema nor the read.
import { queryOptions } from "@tanstack/react-query";
import { Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { pageFetch } from "../../lib/query/policy.ts";

const EVERY_MS = 60_000;

export const peopleOptions = queryOptions({
  queryKey: keys.people(),
  refetchInterval: EVERY_MS,
  queryFn: async ({ signal }) => {
    const people = await import("./people.ts").then(({ readPeople }) => readPeople({ fetch: pageFetch, signal }));
    if (people === undefined) throw new Unread(undefined);
    return people;
  },
});
