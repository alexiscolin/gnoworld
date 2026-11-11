// An angle that eases to another by the planet's own turn's rules: a critically damped spring, no start with a bang, no overshoot.
const STIFF = 2;
const SETTLED = 1e-3;

export class Spring {
  at = 0;
  to = 0;
  #rate = 0;

  get moving(): boolean {
    return Math.abs(this.to - this.at) > SETTLED || Math.abs(this.#rate) > SETTLED;
  }

  advance(step: number, most: number): void {
    const pull = STIFF * STIFF * (this.to - this.at) - 2 * STIFF * this.#rate;
    this.#rate = Math.max(-most, Math.min(most, this.#rate + pull * step));
    this.at += this.#rate * step;
    if (!this.moving) this.jump(this.to);
  }

  /** Stands at `angle` at once, at rest. */
  jump(angle: number): void {
    this.at = this.to = angle;
    this.#rate = 0;
  }
}
