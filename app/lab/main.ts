// The realism page (slice 7, 7b): twelve worlds from a small set of real maps, a world close up, a star behind a world, and one nebula made
// two ways, for Alexis's eye on a real GPU. Not shipped: lab.config.ts builds it, and only the journeys and his link see it. Under reduced
// motion it draws once a change, which is also what a software GPU's journeys want.
import { ANCHORS, pixelRatioFor } from "@gnoworld/core";
import { ACESFilmicToneMapping, Vector3, type WebGLRenderer } from "three";
import { gpuName } from "../src/features/universe/gpu.ts";
import { CREDITS } from "../src/scene/planet/credits.ts";
import { mapBytes } from "../src/scene/planet/maps.ts";
import { createRenderer } from "../src/scene/renderer.ts";
import { buildView, looksOf, pathOf, type Choice, type Method, type View, type ViewName } from "./views.ts";
import "@gnoworld/ui/styles.css";
import "./lab.css";

const VIEWS: readonly ViewName[] = ["gallery", "close", "eclipse", "nebula", "earth"];
const KEYS: Partial<Record<string, ViewName>> = {
  "1": "gallery",
  "2": "close",
  "3": "eclipse",
  "4": "nebula",
  "5": "earth",
};
// The grade 7a2 gives the renderer itself, once it lands.
const EXPOSURE = 0.8;
// The nebula's foreground, unless a world is asked for: the gas giant.
const GIANT = 6;

function need(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

function theCanvas(): HTMLCanvasElement {
  const found = document.querySelector("canvas");
  if (found === null) throw new Error("no canvas");
  return found;
}

function worldIn(query: URLSearchParams, view: ViewName): number {
  const world = Number(query.get("world"));
  const valid = query.has("world") && Number.isInteger(world) && world >= 0 && world < ANCHORS.length;
  if (valid) return world;
  return view === "nebula" ? GIANT : 0;
}

function chosen(query: URLSearchParams): Choice {
  const view = VIEWS.find((name) => name === query.get("view")) ?? "gallery";
  const method: Method = query.get("method") === "image" ? "image" : "computed";
  return { view, world: worldIn(query, view), seed: 0, method };
}

const canvas = theCanvas();
const panel = need("main");
const say = (id: string, text: string) => {
  need(`[data-testid='${id}']`).textContent = text;
};
need("footer").textContent = CREDITS.map((credit) => credit.line).join(" · ");

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ratio = pixelRatioFor(devicePixelRatio, false, "high");
const renderer: WebGLRenderer = createRenderer(canvas, true);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSURE;
renderer.setPixelRatio(ratio);
const gpu = gpuName(renderer.getContext() as WebGL2RenderingContext);

let choice = chosen(new URLSearchParams(location.search));
let view: View | undefined;
let building = 0;
let eyeX = 0;
let eyeY = 0;
let frames = 0;

// Resizing a canvas clears it and reallocates its buffers: only a real change of size may do it.
function fit(): void {
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
}

const aim = (current: View) => {
  current.look(eyeX, eyeY, canvas.clientWidth / canvas.clientHeight);
};

function report(): void {
  const name = `${ANCHORS[choice.world] ?? ""}: ${pathOf(choice.world, choice.seed)}`;
  const names: Partial<Record<ViewName, string>> = { gallery: "All twelve anchors", earth: "The Earth" };
  say("world", names[choice.view] ?? name);
  for (const button of document.querySelectorAll<HTMLButtonElement>("nav button"))
    button.setAttribute("aria-pressed", String(button.dataset["view"] === choice.view));
}

function draw(current: View): void {
  renderer.render(current.stage, current.camera);
  canvas.dataset["drawn"] = "true";
  frames += 1;
}

async function show(next: Choice): Promise<void> {
  choice = next;
  canvas.dataset["drawn"] = "false";
  building += 1;
  const mine = building;
  const built = await buildView(next, { renderer, base: import.meta.env.BASE_URL, ratio });
  if (mine !== building) {
    built.dispose();
    return;
  }
  view?.dispose();
  view = built;
  fit();
  aim(built);
  built.tick(0);
  report();
  draw(built);
}

function step(change: Partial<Choice>): void {
  show({ ...choice, ...change }).catch((error: unknown) => {
    say("world", `failed: ${String(error)}`);
    throw error;
  });
}

function pressed({ key }: KeyboardEvent): void {
  const count = ANCHORS.length;
  const named = KEYS[key];
  if (named !== undefined) step({ view: named });
  else if (key === "ArrowRight") step({ world: (choice.world + 1) % count });
  else if (key === "ArrowLeft") step({ world: (choice.world + count - 1) % count });
  else if (key === "s") step({ seed: choice.seed + 1 });
  else if (key === "n") step({ view: "nebula", method: choice.method === "image" ? "computed" : "image" });
  else if (key === "p") panel.hidden = !panel.hidden;
}

function moved(event: PointerEvent): void {
  eyeX = (event.clientX / innerWidth) * 2 - 1;
  eyeY = 1 - (event.clientY / innerHeight) * 2;
  if (view === undefined) return;
  aim(view);
  if (still) draw(view);
}

function resized(): void {
  fit();
  if (view === undefined) return;
  aim(view);
  if (still) draw(view);
}

function stats() {
  const empty = { view: "", worlds: 0, images: 0, mapBytes: 0, targetBytes: 0 };
  const shown =
    view === undefined
      ? empty
      : {
          view: choice.view === "nebula" ? `nebula ${choice.method}` : choice.view,
          worlds: view.worlds.length,
          images: view.images,
          mapBytes: mapBytes(view.textures),
          targetBytes: view.targetBytes,
        };
  const { memory, render, programs } = renderer.info;
  return {
    ...shown,
    frames,
    textures: memory.textures,
    programs: programs?.length ?? 0,
    calls: render.calls,
    renderer: gpu,
  };
}

function circles() {
  if (view === undefined) return [];
  const { camera } = view;
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const half = canvas.clientWidth / 2;
  return view.worlds.map(({ group }) => {
    const centre = group.position.clone().project(camera);
    const edge = group.position.clone().addScaledVector(right, group.scale.x).project(camera);
    return {
      x: (centre.x + 1) * half,
      y: ((1 - centre.y) * canvas.clientHeight) / 2,
      r: (edge.x - centre.x) * half,
    };
  });
}

addEventListener("keydown", pressed);
addEventListener("pointermove", moved);
addEventListener("resize", resized);
canvas.addEventListener("webglcontextrestored", () => {
  location.reload();
});
for (const button of document.querySelectorAll<HTMLButtonElement>("nav button"))
  button.addEventListener("click", () => {
    step({ view: VIEWS.find((name) => name === button.dataset["view"]) ?? "gallery" });
  });

if (!still)
  renderer.setAnimationLoop((time) => {
    if (view === undefined) return;
    view.tick(time / 1000);
    draw(view);
  });

Reflect.set(globalThis, "__lab", { stats, circles, looks: () => looksOf(choice) });

step({});
