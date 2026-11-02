// The Auto probe (ADR-0002 §9, rendering): it times a device not yet judged. Core gives the verdict; the scene does what it says.
import { judgeFrames, PROBE_FRAMES, type ProbeVerdict } from "@gnoworld/core";

export class Probe {
  readonly #samples = new Float32Array(PROBE_FRAMES);
  readonly #judged: (verdict: Exclude<ProbeVerdict, "pending">) => void;
  #sampled = 0;
  #running: boolean;

  constructor(running: boolean, judged: (verdict: Exclude<ProbeVerdict, "pending">) => void) {
    this.#running = running;
    this.#judged = judged;
  }

  get running(): boolean {
    return this.#running;
  }

  /** A frame took `delta` ms. */
  frame(delta: number): void {
    if (!this.#running || delta <= 0) return;
    this.#samples[this.#sampled] = delta;
    this.#sampled += 1;
    const verdict = judgeFrames(this.#samples, this.#sampled);
    if (verdict === "pending") return;
    this.#running = false;
    this.#judged(verdict);
  }
}
