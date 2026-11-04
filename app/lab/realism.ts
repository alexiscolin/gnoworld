// The realism page (slice 7, 7b): twelve worlds from a small set of real maps, a world close up, a star behind a world, for Alexis's eye on
// a real GPU; the nebulae are the cosmos's (7d4). Not shipped: lab.config.ts builds it, and only the journeys and his link see it. Under
// reduced motion it draws once a change, which is also what a software GPU's journeys want.
import { ANCHORS, pixelRatioFor, STAGES, type Stage } from "@gnoworld/core";
import type { WebGLRenderer } from "three";
import { gpuName } from "../src/features/universe/gpu.ts";
import { CREDITS } from "../src/scene/planet/credits.ts";
import { createRenderer } from "../src/scene/renderer.ts";
import { pathOf, type Choice, type Tier, type ViewName } from "./choice.ts";
import { tuningPanel } from "./panel.ts";
import { probes } from "./probes.ts";
import { buildView, type View } from "./views.ts";

const VIEWS: readonly ViewName[] = [
  "gallery",
  "gallery24",
  "real24",
  "class24",
  "variety",
  "close",
  "eclipse",
  "earth",
  "stages",
];
const KEYS: Partial<Record<string, ViewName>> = {
  "1": "gallery",
  "2": "close",
  "3": "eclipse",
  "5": "earth",
  "6": "stages",
  "7": "real24",
  "8": "gallery24",
  "9": "class24",
  "0": "variety",
};

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

function worldIn(query: URLSearchParams): number {
  const world = Number(query.get("world"));
  const valid = query.has("world") && Number.isInteger(world) && world >= 0 && world < ANCHORS.length;
  return valid ? world : 0;
}

// The seed asked, a whole number from 0; S then counts on from it.
function seedIn(query: URLSearchParams): number {
  const seed = Number(query.get("seed"));
  return Number.isInteger(seed) && seed > 0 ? seed : 0;
}

// One of the recorded file's 24 seen close: an index, or none.
function realIn(query: URLSearchParams): number | null {
  const asked = query.get("real");
  const index = Number(asked);
  return asked !== null && asked !== "" && Number.isInteger(index) && index >= 0 && index < 24 ? index : null;
}

function chosen(query: URLSearchParams): Choice {
  const view = VIEWS.find((name) => name === query.get("view")) ?? "gallery";
  const stage = STAGES.find((name) => name === query.get("stage")) ?? "rest";
  const present = query.has("present") ? Number(query.get("present")) : null;
  const off = (name: string) => query.get(name) === "off";
  return {
    view,
    world: worldIn(query),
    seed: seedIn(query),
    stage,
    present,
    real: realIn(query),
    minor: !off("minor"),
    clouds: !off("clouds"),
    front: query.get("light") === "front",
    flat: query.get("maps") === "flat",
  };
}

// The next stage along the road, stopping at its ends.
const stageBy = (stage: Stage, by: number): Stage => {
  const at = STAGES.indexOf(stage) + by;
  return STAGES[Math.min(Math.max(at, 0), STAGES.length - 1)] ?? stage;
};

const canvas = theCanvas();
const panel = need("main");
const say = (id: string, text: string) => {
  need(`[data-testid='${id}']`).textContent = text;
};
need("footer").textContent = CREDITS.map((credit) => credit.line).join(" · ");

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const tier: Tier = new URLSearchParams(location.search).get("tier") === "low" ? "low" : "high";
const ratio = pixelRatioFor(devicePixelRatio, false, tier);
const renderer: WebGLRenderer = createRenderer(canvas, true);
renderer.setPixelRatio(ratio);
const gpu = gpuName(renderer.getContext() as WebGL2RenderingContext);

let choice = chosen(new URLSearchParams(location.search));
let view: View | undefined;
let building = 0;
let eyeX = 0;
let eyeY = 0;
let frames = 0;

// What the journeys read of the page; C shows a frame's cost, for a real GPU, where a software one cannot tell (7b5's report).
const FRAMES_MEASURED = 30;
const lab = probes({ renderer, canvas, gpu, draw, view: () => view, choice: () => choice, frames: () => frames });

// Resizing a canvas clears it and reallocates its buffers: only a real change of size may do it.
function fit(): void {
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
}

const aim = (current: View) => {
  current.look(eyeX, eyeY, canvas.clientWidth / canvas.clientHeight);
};

function report(): void {
  const name = `${ANCHORS[choice.world] ?? ""}: ${pathOf(choice.world, choice.seed)}`;
  const names: Partial<Record<ViewName, string>> = {
    gallery: "ADR-0002's twelve anchors",
    gallery24: "All 24 anchors",
    real24: "24 worlds of the recorded file",
    class24: `24 worlds of one class, ${ANCHORS[choice.world] ?? ""}`,
    variety: "Eight classes in frame",
    earth: "The Earth",
  };
  say("world", `${names[choice.view] ?? name} · ${choice.view === "stages" ? "every stage" : choice.stage}`);
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

// Keys that change no view: P hides the panel, C reads a frame's cost.
const asides: Partial<Record<string, () => void>> = {
  p: () => {
    panel.hidden = !panel.hidden;
  },
  c: () => {
    say("world", `${lab.cost(FRAMES_MEASURED).toFixed(1)} ms a frame, ${String(FRAMES_MEASURED)} frames`);
  },
};

function pressed({ key }: KeyboardEvent): void {
  const count = ANCHORS.length;
  const named = KEYS[key];
  const aside = asides[key];
  if (aside !== undefined) aside();
  else if (named !== undefined) step({ view: named });
  else if (key === "ArrowRight") step({ world: (choice.world + 1) % count });
  else if (key === "ArrowLeft") step({ world: (choice.world + count - 1) % count });
  else if (key === "s") step({ seed: choice.seed + 1 });
  else if (key === "[") step({ stage: stageBy(choice.stage, -1) });
  else if (key === "]") step({ stage: stageBy(choice.stage, 1) });
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

Reflect.set(globalThis, "__lab", lab);
tuningPanel(() => {
  if (view !== undefined) draw(view);
});

step({});
