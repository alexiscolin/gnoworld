// A realm's tokens as a query: the server's replay, read once the plate is drawn and kept for a minute. A refusal is the answer (a realm with
// no token), a drop or a server fault is asked again only by the block's own "Try again".
import { queryOptions } from "@tanstack/react-query";
import { pageTokensApi } from "../../lib/api/tokens.ts";
import { readApi } from "../../lib/query/api.ts";
import { keys } from "../../lib/query/keys.ts";

export const tokenOptions = (realm: string) =>
  queryOptions({
    queryKey: keys.token(realm),
    queryFn: ({ signal }) => readApi((s) => pageTokensApi().read(realm, s), signal),
    staleTime: 60_000,
    retry: false,
  });
