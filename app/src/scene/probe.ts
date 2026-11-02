// The Auto probe (ADR-0002 §9, rendering): it times a device not yet judged, and holds the loop's rate while it times and while the
// Earth arrives. Core gives the verdict; the scene does what it says.
import { judgeFrames, PROBE_FRAMES, type ProbeVerdict } from "@gnoworld/core";

export class Probe {
  readonly #samples = new Float32Array(PROBE_FRAMES);
  readonly #busy: (busy: boolean) => void;
  readonly #judged: (verdict: Exclude<ProbeVerdict, "pending">) => void;
  #sampled = 0;
  #running: boolean;
  #arriving = false;
  #earthTimed = false;

  constructor(
    running: boolean,
    busy: (busy: boolean) => void,
    judged: (verdict: Exclude<ProbeVerdict, "pending">) => void,
  ) {
    this.#running = running;
    this.#busy = busy;
    this.#judged = judged;
  }

  get running(): boolean {
    return this.#running;
  }

  /** The Earth stood: the first frames timed an empty stage, and the Earth is what a device must carry. Once, if `allowed`. */
  earthStood(allowed: boolean): void {
    if (this.#earthTimed || !allowed) return;
    this.#earthTimed = true;
    this.#sampled = 0;
    this.#running = true;
    this.#busy(true);
  }

  /** A frame took `delta` ms, with the Earth `arriving` or not: its first seconds are the ones that count, at a rate of their own. */
  frame(delta: number, arriving: boolean): void {
    this.#time(delta);
    if (arriving === this.#arriving) return;
    this.#arriving = arriving;
    this.#busy(this.#running || arriving);
  }

  #time(delta: number): void {
    if (!this.#running || delta <= 0) return;
    this.#samples[this.#sampled] = delta;
    this.#sampled += 1;
    const verdict = judgeFrames(this.#samples, this.#sampled);
    if (verdict === "pending") return;
    this.#running = false;
    this.#busy(this.#arriving);
    this.#judged(verdict);
  }
}
