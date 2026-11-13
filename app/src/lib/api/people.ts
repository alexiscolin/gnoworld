// The browser's client of a person's card data (server/src/worlds/person.ts, mounted at /api/people), through the one JSON call of
// lib/api/http.ts: the answer is read through its schema, or why not.
import { PersonCardData } from "@gnoworld/schemas/indexer";
import { pageFetch } from "../query/policy.ts";
import { getter } from "./http.ts";

/** The people's client of this page, on its own fetch: what the server knows of the account `address`, which it checks itself. */
export const pagePeopleApi = () => ({
  read: getter(pageFetch)(PersonCardData, (address: string) => `/api/people/${encodeURIComponent(address)}`),
});
