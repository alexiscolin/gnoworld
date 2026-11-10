// The app's query client in a test (slice 13): a test's reads are its own, so the held answers go before each, and a failed read is not asked again
// (the retries' backoff is not a test's wait). Imported by the helpers that mount or render a page.
import { beforeEach } from "vitest";
import { queryClient } from "../src/lib/query/client.ts";

queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
beforeEach(() => {
  queryClient.clear();
});

/** After `vi.resetModules()`: the query client of the new module graph asks no read again, as this one's does. */
export async function quietFreshQueries(): Promise<void> {
  const { queryClient: fresh } = await import("../src/lib/query/client.ts");
  fresh.setDefaultOptions({ queries: { ...fresh.getDefaultOptions().queries, retry: false } });
}
