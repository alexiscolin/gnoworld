// A realm's or a world's explanation as a query: asked once the plate is drawn, kept a minute, asked again every few seconds while the server
// says it is being made, at most 20 times. A refusal or a drop is no explanation: the plate keeps the page's own first line.
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import type { ExplainKind } from "@gnoworld/schemas";
import { pageExplanationsApi } from "../../lib/api/explanations.ts";
import { readApi } from "../../lib/query/api.ts";
import { queryClient } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";

const POLL_MS = 4000;
const POLLS = 20;

export interface Explained {
  kind: ExplainKind;
  /** The chain's id, such as `onyx-1`. */
  chain: string;
  /** The realm's path; a world's is its main realm's. */
  subject: string;
}

const explanationOptions = ({ kind, chain, subject }: Explained) =>
  queryOptions({
    queryKey: keys.explanation(kind, chain, subject),
    queryFn: () => readApi(() => pageExplanationsApi().read(kind, chain, subject)),
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.status === "making" && query.state.dataUpdateCount < POLLS ? POLL_MS : false,
  });

/** What the server says of the subject, none while it is asked or when it could not say. */
export const useExplanation = (of: Explained) => useQuery(explanationOptions(of), queryClient).data;
