// The one place the renderer is made (ADR-0002 §9: the low-power adapter, no stencil), and with it the image's one grade (ADR-0002 §10):
// a filmic curve holds the frames' deep black and rolls warm light off to white, before anything compiles, and for everything drawn.
import { ACESFilmicToneMapping, WebGLRenderer } from "three";

// The dive's grade (D401): the planets' quads and the planets drawn as themselves are matched under it, the rail's portraits too.
const EXPOSURE = 1;

type Rgb = readonly [number, number, number];
// three 0.187's ACES (tonemapping_pars_fragment.glsl.js) by its matrices' columns, its fit, and the screen's sRGB transfer.
const INTO = [
  [0.59719, 0.076, 0.0284],
  [0.35458, 0.90834, 0.13383],
  [0.04823, 0.01566, 0.83777],
] as const;
const OUT = [
  [1.60475, -0.10208, -0.00327],
  [-0.53108, 1.10813, -0.07276],
  [-0.07367, -0.00605, 1.07602],
] as const;
const times = (columns: typeof INTO | typeof OUT, v: Rgb): Rgb => {
  const at = (row: 0 | 1 | 2) => columns[0][row] * v[0] + columns[1][row] * v[1] + columns[2][row] * v[2];
  return [at(0), at(1), at(2)];
};
const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
const toScreen = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};
const fromScreen = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** What the screen shows of `v`, a linear value a shader writes before the grade. */
export const graded = (v: Rgb): Rgb => {
  const k = EXPOSURE / 0.6;
  const into = times(INTO, [v[0] * k, v[1] * k, v[2] * k]);
  const [r, g, b] = times(OUT, [fit(into[0]), fit(into[1]), fit(into[2])]);
  return [toScreen(r), toScreen(g), toScreen(b)];
};

/** The linear value a shader writes before the grade for `screen`, the colour meant on screen (0 to 1), the grade's own chunks at its
 * end: so drawn straight or through the blur's pass (rig/speed.ts), which grades the whole frame at once, it shows that colour. */
export function beforeGrade(screen: Rgb): Rgb {
  let v: Rgb = [fromScreen(screen[0]), fromScreen(screen[1]), fromScreen(screen[2])];
  // Each channel scaled by how far its graded value falls short, in linear light: the grade climbs with its input, so this settles.
  for (let step = 0; step < 32; step += 1) {
    const now = graded(v);
    const scale = (at: 0 | 1 | 2) => fromScreen(screen[at]) / Math.max(fromScreen(now[at]), 1e-7);
    v = [v[0] * scale(0), v[1] * scale(1), v[2] * scale(2)];
  }
  return v;
}

/** A renderer on `canvas`, transparent where `alpha`. Throws where WebGL2 is refused. */
export function createRenderer(canvas: HTMLCanvasElement, antialias: boolean, alpha = false): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias, alpha, stencil: false, powerPreference: "low-power" });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  return renderer;
}

/** What lets the scene's renderer go, once `stop` ended its loop. */
export const releasing = (renderer: WebGLRenderer, stop: () => void) => ({
  dispose: () => {
    stop();
    renderer.forceContextLoss();
    renderer.dispose();
  },
});
