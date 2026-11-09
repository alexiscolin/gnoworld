// Pixels read back without the page waiting: the GPU writes each into a pack buffer of its own and a fence says when it is done, so a read
// costs the page the copy alone, not the GPU's whole queue (WebGL2, which three needs; a context without it has no packs).
const POLL_MS = 8;
const QUALITY = 0.9;
// What frame 4's planets keep on their night side, out of 255: their dark edges are never black (#201e1d to #292524).
const NIGHT = 26;

/** The context as WebGL2's, or none where it is not. */
export const webgl2 = (gl: WebGLRenderingContext | WebGL2RenderingContext): WebGL2RenderingContext | undefined =>
  "fenceSync" in gl ? gl : undefined;

export class Packs {
  /** Where each read's pixels are copied to, once the GPU is done. */
  readonly out: readonly Uint8Array[];
  readonly #gl: WebGL2RenderingContext;
  readonly #buffers: readonly WebGLBuffer[];

  constructor(gl: WebGL2RenderingContext, count: number, bytes: number) {
    this.#gl = gl;
    this.out = Array.from({ length: count }, () => new Uint8Array(bytes));
    this.#buffers = this.out.map(() => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      return buffer;
    });
  }

  /** Reads the framebuffer's bottom-left `side` by `side` pixels into the pack `at`, at once and without waiting. */
  start(at: number, side: number): void {
    const gl = this.#gl;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#buffers[at] ?? null);
    gl.readPixels(0, 0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }

  /** A fence after everything the GPU was given so far. */
  fence(): WebGLSync | undefined {
    const fence = this.#gl.fenceSync(this.#gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.#gl.flush();
    return fence ?? undefined;
  }

  /** Waits, between the page's frames, for `fence`, then copies the first `count` packs into `out`: false once `signal` aborted or the
   * context was lost. */
  async finished(fence: WebGLSync, count: number, signal: AbortSignal): Promise<boolean> {
    const gl = this.#gl;
    for (;;) {
      if (signal.aborted || gl.isContextLost()) return false;
      const state = gl.clientWaitSync(fence, 0, 0);
      if (state === gl.ALREADY_SIGNALED || state === gl.CONDITION_SATISFIED) break;
      await new Promise((later) => setTimeout(later, POLL_MS));
    }
    gl.deleteSync(fence);
    for (let at = 0; at < count; at += 1) {
      const into = this.out[at];
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#buffers[at] ?? null);
      if (into !== undefined) gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, into);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return true;
  }

  free(): void {
    if (this.#gl.isContextLost()) return;
    for (const buffer of this.#buffers) this.#gl.deleteBuffer(buffer);
  }
}

// The rows the GPU reads from the bottom, the right way up, the night lifted to its floor, as a JPEG: none where the page cannot draw one.
export function encoded(pixels: Uint8Array, side: number): string | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  const image = context.createImageData(side, side);
  const row = 4 * side;
  for (let y = 0; y < side; y += 1) image.data.set(pixels.subarray(y * row, (y + 1) * row), (side - 1 - y) * row);
  for (let at = 0; at < image.data.length; at += 1)
    if (at % 4 !== 3) image.data[at] = NIGHT + ((image.data[at] ?? 0) * (255 - NIGHT)) / 255;
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/jpeg", QUALITY);
}
