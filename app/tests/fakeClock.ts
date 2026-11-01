// The scene's clock in a test: a screen that refreshes at `hz`, its timers and its asked frames served in time order, so the
// loop's rates are counted, never timed.
import type { FrameClock } from "../src/scene/loop.ts";

export class FakeClock implements FrameClock {
  time = 0;
  /** Every frame asked of the screen, served or not. */
  asks = 0;
  readonly askedWith = new Set<unknown>();
  readonly waited = new Set<unknown>();
  private readonly frames = new Map<number, (time: number) => void>();
  private readonly timers = new Map<number, { at: number; run: () => void }>();
  private next = 1;
  private refresh = 0;
  private readonly hz: number;

  constructor(hz = 60) {
    this.hz = hz;
  }

  now = () => this.time;

  ask = (run: (time: number) => void) => {
    this.asks += 1;
    this.askedWith.add(run);
    const id = this.next++;
    this.frames.set(id, run);
    return id;
  };

  cancelAsk = (id: number) => {
    this.frames.delete(id);
  };

  wait = (run: () => void, ms: number) => {
    this.waited.add(run);
    const id = this.next++;
    this.timers.set(id, { at: this.time + Math.max(0, ms), run });
    return id;
  };

  cancelWait = (id: number) => {
    this.timers.delete(id);
  };

  /** How many frames or timers wait to be served. */
  get pending() {
    return { frames: this.frames.size, timers: this.timers.size };
  }

  /** Time passes: each timer and each refresh that falls inside `ms`, in order. */
  run(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const refreshAt = (this.refresh + 1) * (1000 / this.hz);
      const timer = [...this.timers].sort(([, a], [, b]) => a.at - b.at)[0];
      const at = Math.min(refreshAt, timer?.[1].at ?? Infinity);
      if (at > end) break;
      this.time = at;
      if (timer !== undefined && timer[1].at <= refreshAt) {
        this.timers.delete(timer[0]);
        timer[1].run();
      } else {
        this.refresh += 1;
        const due = [...this.frames];
        this.frames.clear();
        for (const [, run] of due) run(at);
      }
    }
    this.time = end;
  }
}
