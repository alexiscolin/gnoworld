// The browser's client of the chat's search (server/src/search/routes.ts, mounted at /api/search; slice 13, C), through the one JSON
// call of lib/api/http.ts. The words are checked as the server checks them before any is sent; the answer is read through the
// schema and refused whole when a mark lies outside its text: a server answer is data, never trusted.
import { SearchPage, SearchQuery } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";
import { pageFetch } from "../query/policy.ts";

/** Whether `marks` are ranges of `text`'s UTF-16 units, each of some width, in order and apart. */
export function marksSound(text: string, marks: readonly (readonly [number, number])[]): boolean {
  let end = 0;
  for (const [from, to] of marks) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < end || to <= from || to > text.length) return false;
    end = to;
  }
  return true;
}

const Answer = SearchPage.check(z.refine(({ hits }) => hits.every(({ text, marks }) => marksSound(text, marks))));

/** What the page may ask: the words as typed, which the schema normalises. */
export type SearchAsk = z.input<typeof SearchQuery>;

export function searchApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  return {
    /** A page of hits for the words, the reader's rooms alone (the server decides); `signal` ends the call early. */
    search: (ask: SearchAsk, signal?: AbortSignal): Promise<Result<SearchPage>> => {
      const query = SearchQuery.safeParse(ask);
      if (!query.success) return Promise.resolve({ ok: false, reason: "refused" });
      const params = new URLSearchParams(
        Object.entries(query.data).flatMap(([key, value]): [string, string][] =>
          typeof value === "string" ? [[key, value]] : [],
        ),
      );
      return jsonCall(fetcher, timeoutMs)({ path: `/api/search?${params.toString()}`, schema: Answer, signal });
    },
  };
}

/** The search's client of this page, on its own fetch. */
export const pageSearchApi = () => searchApi(pageFetch);
