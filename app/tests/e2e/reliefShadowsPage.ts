import { asciiBytes, planetLook, planetRecipe } from "@gnoworld/core";
import { PerspectiveCamera, Scene, SphereGeometry, Vector3, WebGLRenderer, type Texture } from "three";
import { MOON, GROUND_TO_MAP } from "../../src/space/earth/look.ts";
import { createWorld } from "../../src/space/planet/generated.ts";
import { loadMap, mapUrl } from "../../src/space/planet/maps.ts";
import { createPlanet, type Planet } from "../../src/space/planet/planet.ts";

// The page side of reliefShadows.spec.ts: the real planet code (the Moon with its height map, a rocky generated world), its fragment
// program's output swapped for the share of the sun the relief's shadows leave, the sun turned about the pole in small steps.
const SIZE = 700;
const canvas = document.createElement("canvas");
document.body.append(canvas);
const renderer = new WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: false });
renderer.setSize(SIZE, SIZE, false);
const sphere = new SphereGeometry(1, 128, 64);
const held = new Map<string, Texture>();
const get = async (name: string, kind: "colour" | "data") => {
  const found = held.get(name) ?? (await loadMap(mapUrl(name, "/", 2048), { kind, anisotropy: 4, width: 2048 }));
  held.set(name, found);
  return found;
};

async function moon(): Promise<Planet> {
  const clouds = await get("clouds", "data");
  const map = await get("moon", "colour");
  const planet = createPlanet(MOON, { map: () => map, clouds, ring: clouds }, sphere);
  const spin = planet.surface.uniforms["spin"];
  if (spin !== undefined) spin.value = GROUND_TO_MAP;
  const height = await get("moon-height", "data");
  planet.setHeight(height);
  await new Promise((done) => setTimeout(done, 700));
  planet.setHeight(height);
  return planet;
}

// The first of 400 fixed paths that is rocky, craterised and reliefed: the same world on every run.
async function rocky(): Promise<Planet> {
  const clouds = await get("clouds", "data");
  for (let at = 0; at < 400; at++) {
    const path = asciiBytes(`probe/rocky/${String(at)}`);
    const look = planetLook(path, "rocky");
    const recipe = planetRecipe(path, "rocky");
    if (look.relief < 0.012 || recipe.surface.craters < 0.15) continue;
    const need = new Map<string, Texture>();
    for (const name of [look.map, recipe.minorMap, "ring"])
      need.set(name, await get(name, name === "ring" ? "data" : "colour"));
    return createWorld(
      { look, recipe },
      { map: (name) => need.get(name) ?? clouds, clouds, ring: need.get("ring") ?? clouds },
      sphere,
    );
  }
  throw new Error("no rocky world");
}

interface Counted {
  big: number;
  mid: number;
  shadowed: number;
}

// The program's output swapped for the share of the sun the shadows leave (0 to 1, as the red channel), no tone mapping on it.
function shareOnly(planet: Planet): void {
  const { fragmentShader } = planet.surface;
  planet.surface.fragmentShader = fragmentShader
    .replace("gl_FragColor = vec4(colour, 1.0);", "gl_FragColor = vec4(vec3(lit), 1.0);")
    .replace("#include <tonemapping_fragment>", "")
    .replace("#include <colorspace_fragment>", "");
  if (planet.surface.fragmentShader === fragmentShader) throw new Error("the shader has no `lit` output to read");
}

function tally(now: Uint8Array, before: Uint8Array | undefined, total: Counted): void {
  for (let i = 0; i < now.length; i++) {
    const share = now[i] ?? 255;
    if (share < 245) total.shadowed++;
    const jump = before === undefined ? 0 : Math.abs(share - (before[i] ?? 0));
    if (jump > 50) total.big++;
    else if (jump > 25) total.mid++;
  }
}

/** Per step of the sun, how many pixels of the shadow share changed by more than 50 of 255, and by 25 to 50, from the step before. */
async function sweep(what: "moon" | "rocky", step: number, count: number): Promise<Counted> {
  const planet = await (what === "moon" ? moon() : rocky());
  shareOnly(planet);
  const scene = new Scene();
  scene.add(planet.group);
  planet.setTime(0, 0);
  planet.setDepth(true);
  planet.setClose(1);
  planet.group.rotation.x += 0.25;
  const camera = new PerspectiveCamera(22, 1, 0.1, 100);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const pole = new Vector3(0, 1, 0).applyEuler(planet.group.rotation);
  const gl = renderer.getContext();
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  let before: Uint8Array | undefined;
  const total: Counted = { big: 0, mid: 0, shadowed: 0 };
  for (let at = 0; at < count; at++) {
    planet.setSun(new Vector3(1, 0.15, 0.35).applyAxisAngle(pole, at * step).normalize());
    renderer.render(scene, camera);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const now = pixels.filter((_, index) => index % 4 === 0);
    tally(now, before, total);
    before = now;
  }
  return total;
}
Object.assign(globalThis, { sweep });
