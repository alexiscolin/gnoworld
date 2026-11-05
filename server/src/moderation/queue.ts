// The check's queue (slice 3's plan, 3i): fair per account, so one account's flood holds another's line
// back by one at most, and an account holds a share of it only; four checks at once; capped, a line past
// the cap left unchecked with the alert. Its oldest line's age is logged every 30 s, the alert past 2 min.
import type { Log } from "@gnoworld/service/log";

export interface Queue<T> {
  push: (item: T) => boolean;
  size: () => number;
  idle: () => Promise<void>;
  // Starts nothing more; idle() then waits for the checks already running.
  stop: () => void;
}

interface Options<T> {
  run: (item: T) => Promise<void>;
  log: Log;
  now?: () => number;
  cap?: number;
  perAccount?: number;
  concurrency?: number;
}

export function makeQueue<T extends { account: string }>(options: Options<T>): Queue<T> {
  const { run, log, now = Date.now, cap = 10_000, perAccount = 100, concurrency = 4 } = options;
  // Each account's lines in order; the Map's order is the turn: an account served goes to the back.
  const waiting = new Map<string, { item: T; at: number }[]>();
  let [count, running, stopped] = [0, 0, false];
  let idlers: (() => void)[] = [];
  const settle = (): void => {
    if ((count > 0 && !stopped) || running > 0) return;
    for (const resolve of idlers) resolve();
    idlers = [];
  };
  const pump = (): void => {
    for (const [account, lines] of waiting) {
      if (running >= concurrency || stopped) return;
      const next = lines.shift();
      waiting.delete(account);
      if (lines.length > 0) waiting.set(account, lines);
      if (next === undefined) continue;
      count -= 1;
      running += 1;
      const done = (): void => {
        running -= 1;
        pump();
        settle();
      };
      // A check that fails frees its place: its name goes to the log, never the line.
      const failed = (error: unknown): void => {
        log("moderation_failed", { error: error instanceof Error ? error.name : "unknown" });
        done();
      };
      run(next.item).then(done, failed);
    }
  };
  const backlog = setInterval(() => {
    if (count === 0) return;
    const oldest = Math.min(...[...waiting.values()].map(([first]) => first?.at ?? Infinity));
    const ms = now() - oldest;
    log("moderation_backlog", { ms });
    if (ms >= 120_000) log("alert", { error: "moderation_backlog" });
  }, 30_000);
  return {
    push(item) {
      if (count >= cap) {
        log("alert", { error: "moderation_queue_full" });
        return false;
      }
      const lines = waiting.get(item.account) ?? [];
      if (lines.length >= perAccount) {
        log("moderation_account_full", { account: item.account });
        return false;
      }
      lines.push({ item, at: now() });
      if (lines.length === 1) waiting.set(item.account, lines);
      count += 1;
      pump();
      return true;
    },
    size: () => count,
    idle: () =>
      (count === 0 || stopped) && running === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            idlers.push(resolve);
          }),
    stop: () => {
      stopped = true;
      clearInterval(backlog);
    },
  };
}
