// Whether Jarvis is on, as a query: one request for every part that asks, read again as the client's rules say; a failure is a
// read that did not come whole, never kept as an answer.
import { queryOptions } from "@tanstack/react-query";
import type { JarvisState } from "@gnoworld/schemas";
import type { Result } from "../api/http.ts";
import { pageJarvisState } from "../api/jarvisState.ts";
import { Unread } from "./client.ts";
import { keys } from "./keys.ts";

export const jarvisStateOptions = (read: () => Promise<Result<JarvisState>> = pageJarvisState) =>
  queryOptions({
    queryKey: keys.jarvisState(),
    queryFn: async () => {
      const state = await read();
      if (!state.ok) throw new Unread(undefined);
      return state.value.on;
    },
  });
