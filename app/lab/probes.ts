// What the journeys read of the realism page, as `globalThis.__lab`: its numbers, where its worlds stand on screen, what a frame of a view
// costs, which uniforms a world's program keeps, and the worlds it shows.
import { Vector3, type WebGLRenderer } from "three";
import { styleOf } from "../src/scene/planet/generated.ts";
import { mapBytes } from "../src/scene/planet/maps.ts";
import type { Choice } from "./choice.ts";
import type { View } from "./views.ts";

export interface Probed {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly gpu: string;
  readonly draw: (view: View) => void;
  readonly view: () => View | undefined;
  readonly choice: () => Choice;
  readonly frames: () => number;
}

function stats({ renderer, gpu, view, choice, frames }: Probed) {
  const shown = view();
  const drawn =
    shown === undefined
      ? { view: "", worlds: 0, mapBytes: 0 }
      : { view: choice().view, worlds: shown.worlds.length, mapBytes: mapBytes(shown.textures) };
  const { memory, render, programs } = renderer.info;
  return {
    ...drawn,
    frames: frames(),
    textures: memory.textures,
    programs: programs?.length ?? 0,
    calls: render.calls,
    renderer: gpu,
    exposure: renderer.toneMappingExposure,
  };
}

function circles({ canvas, view }: Probed) {
  const shown = view();
  if (shown === undefined) return [];
  const { camera } = shown;
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const half = canvas.clientWidth / 2;
  return shown.worlds.map(({ group }) => {
    const centre = group.position.clone().project(camera);
    const edge = group.position.clone().addScaledVector(right, group.scale.x).project(camera);
    return { x: (centre.x + 1) * half, y: ((1 - centre.y) * canvas.clientHeight) / 2, r: (edge.x - centre.x) * half };
  });
}

// Each world's pole, its climate's axis, in its own screen frame: right, up and towards the eye from its centre, so a pixel's normal on a
// disc off the view's middle reads its latitude.
function poles({ view }: Probed): [number, number, number][] {
  const shown = view();
  if (shown === undefined) return [];
  const { camera } = shown;
  camera.updateMatrixWorld();
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  return shown.worlds.map(({ group }) => {
    group.updateMatrixWorld();
    const toward = camera.position.clone().sub(group.position).normalize();
    const right = up.clone().cross(toward).normalize();
    const pole = new Vector3(0, 1, 0).applyQuaternion(group.quaternion);
    return [pole.dot(right), pole.dot(toward.clone().cross(right)), pole.dot(toward)];
  });
}

/** What a frame costs, in milliseconds: `draw` run `count` times, the GPU waited for by a read of one pixel before and after. */
export function frameCost(renderer: WebGLRenderer, draw: () => void, count: number): number {
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  draw();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const start = performance.now();
  for (let at = 0; at < count; at += 1) draw();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return (performance.now() - start) / count;
}

// What a frame of the view costs.
function cost({ renderer, view, draw }: Probed, count: number): number {
  const shown = view();
  return shown === undefined
    ? 0
    : frameCost(
        renderer,
        () => {
          draw(shown);
        },
        count,
      );
}

// The uniforms the first world's surface program keeps once compiled: its compiler leaves out what no pixel reads.
function live({ renderer, view }: Probed): string[] {
  const surface = view()?.worlds[0]?.surface;
  if (surface === undefined) return [];
  const held = renderer.properties.get(surface) as { currentProgram?: { program: WebGLProgram } };
  const program = held.currentProgram?.program;
  if (program === undefined) return [];
  const gl = renderer.getContext();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  return Array.from({ length: count }, (_, at) => gl.getActiveUniform(program, at)?.name ?? "");
}

/** The page's reads, for the journeys. */
export function probes(page: Probed) {
  const shown = () => page.view()?.drawn ?? [];
  return {
    stats: () => stats(page),
    circles: () => circles(page),
    poles: () => poles(page),
    cost: (count: number) => cost(page, count),
    live: () => live(page),
    looks: () => shown().map(({ look }) => look),
    ids: () => shown().map(({ id }) => id),
    minors: () => shown().map(({ recipe }) => recipe.minorShare),
    surfaces: () => shown().map(({ recipe }) => recipe.surface),
    // What a glance takes for a world's colours: its land palette's centre, and its sea's two colours where it has a sea.
    centres: () => shown().map(({ recipe }) => ({ land: recipe.palette.lab[1], sea: recipe.sea?.lab ?? null })),
    styles: () => shown().map((world) => styleOf(world)),
    stages: () => page.view()?.stages ?? [],
  };
}
