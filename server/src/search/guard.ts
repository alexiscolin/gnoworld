// The index failing never stops the chat or the retention (T8): a step that throws is logged and answers its fallback.
import type { Log } from "@gnoworld/service/log";

export const guarded =
  (log: Log) =>
  <T>(step: string, work: () => T, fallback: T): T => {
    try {
      return work();
    } catch (error) {
      log("search_failed", { reason: step, error: error instanceof Error ? error.name : "unknown" });
      return fallback;
    }
  };
