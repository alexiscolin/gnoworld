// A person's card data as a query: the server answers from its own state and one node read it caches for a minute, so a read is kept for a
// minute here too; a failed one is asked again only by the reader's own "Try again".
import { queryOptions } from "@tanstack/react-query";
import { pagePeopleApi } from "../../lib/api/people.ts";
import { readApi } from "../../lib/query/api.ts";
import { keys } from "../../lib/query/keys.ts";

export const personOptions = (address: string) =>
  queryOptions({
    queryKey: keys.person(address),
    queryFn: ({ signal }) => readApi((s) => pagePeopleApi().read(address, s), signal),
    staleTime: 60_000,
    retry: false,
  });
