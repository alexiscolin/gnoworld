// The index failing never stops the chat or the retention: a step that throws is logged under `event` and answers its fallback.
import { failureOf, type Log } from "@gnoworld/service/log";

export const guarded =
  (log: Log, event = "search_failed") =>
  <T>(step: string, work: () => T, fallback: T): T => {
    try {
      return work();
    } catch (error) {
      log(event, { reason: step, ...failureOf(error) });
      return fallback;
    }
  };
