// The index failing never stops the chat or the retention (T8): a step that throws is logged under `event` and answers its fallback.
import type { Log } from "@gnoworld/service/log";

export const guarded =
  (log: Log, event = "search_failed") =>
  <T>(step: string, work: () => T, fallback: T): T => {
    try {
      return work();
    } catch (error) {
      log(event, { reason: step, error: error instanceof Error ? error.name : "unknown" });
      return fallback;
    }
  };
