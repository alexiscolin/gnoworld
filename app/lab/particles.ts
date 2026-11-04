// The whole cosmos as one mass of particles round the Earth, a study for Alexis's yes before any product code (7u; decisions, 2026-11-04,
// and his answers that night): every world, realm and package a solid particle, each namespace a clump in volume with seeded dust for its
// matter (particlesLayout.ts), the chosen clump in gold with its rings and a line of light (particlesLook.ts), the video's pills. A new
// world glides the mass to its new places. `before=1` draws the product's web.ts from the same eye, for the frame's cost; `tier=low`.
import { pixelRatioFor, smoothstep, systemsOf, type Tier } from "@gnoworld/core";
import { PerspectiveCamera, Scene } from "three";
import { heldOf as placesOf } from "../src/scene/cosmos/cosmosWorld.ts";
import { Web } from "../src/scene/cosmos/web.ts";
import { focalOf } from "../src/scene/lens.ts";
import { createRenderer } from "../src/scene/renderer.ts";
import { LENS } from "../src/scene/viewport.ts";
import read from "./imports.json" with { type: "json" };
import { linked } from "./linked.ts";
import packages from "./packages.json" with { type: "json" };
import { tuningPanel } from "./panel.ts";
import { namespacesOf, withWorld } from "./particlesData.ts";
import { Labels, onScreen } from "./particlesLabels.ts";
import { laidOut, type Laid } from "./particlesLayout.ts";
import { aim } from "./particlesEye.ts";
import { Look } from "./particlesLook.ts";
import { setValue, studied, values, type Name } from "./particlesValues.ts";
import { frameCost } from "./probes.ts";
import { starField } from "./sky.ts";
import recorded from "./worlds.json" with { type: "json" };

const GLIDE_MS = 1600;
const params = new URLSearchParams(location.search);
const tier: Tier = params.get("tier") === "low" ? "low" : "high";
const before = params.get("before") === "1";

const file = linked(recorded, read);
let namespaces = namespacesOf(file, packages);
const canvas = document.querySelector("canvas");
if (canvas === null) throw new Error("no canvas");
const views = document.querySelector("main");
if (views !== null) views.hidden = true;
const renderer = createRenderer(canvas, tier === "high");
const ratio = pixelRatioFor(devicePixelRatio, false, tier);
renderer.setPixelRatio(ratio);
const stage = new Scene();
const camera = new PerspectiveCamera(LENS.fieldOfView, 1, 0.5, 6000);
stage.add(starField(ratio));

const look = new Look(ratio);
const labels = new Labels();
const web = before ? new Web() : undefined;
let laid: Laid = laidOut(namespaces);
let chosen = Math.max(
  0,
  laid.clusters.findIndex(({ id }) => id === params.get("chosen")),
);
// The glide: each particle from where the last mass held it to its new place, a new one growing from nothing where it stands.
let glide: { from: Float32Array; grow: Set<number>; start: number } | undefined;
let added = 0;

function stand(): void {
  if (web !== undefined) {
    const systems = systemsOf(placesOf(file.worlds));
    web.resize(ratio);
    web.stand({ systems, worlds: file.worlds, written: file.updated }, Date.now());
    stage.add(web.group);
    return;
  }
  const last = new Map(laid.keys.map((key, at) => [key, at]));
  const old = laid.positions;
  laid = laidOut(namespaces);
  const from = new Float32Array(laid.positions);
  const grow = new Set<number>();
  laid.keys.forEach((key, at) => {
    const was = last.get(key);
    if (was === undefined) grow.add(at);
    else from.set(old.subarray(was * 3, was * 3 + 3), at * 3);
  });
  glide = { from, grow, start: performance.now() };
  look.stand(laid);
  labels.stand(laid.clusters, namespaces);
  stage.add(look.group);
}

function glided(now: number): void {
  if (glide === undefined) return;
  const share = smoothstep(0, 1, (now - glide.start) / GLIDE_MS);
  const places = new Float32Array(laid.positions.length);
  for (let at = 0; at < places.length; at += 1) {
    const from = glide.from[at] ?? 0;
    places[at] = from + ((laid.positions[at] ?? 0) - from) * share;
  }
  look.move(places, glide.grow, share);
  if (share >= 1) glide = undefined;
  else ask();
}

function render(): void {
  renderer.render(stage, camera);
}

function draw(): void {
  const [width, height] = [canvas?.clientWidth ?? innerWidth, canvas?.clientHeight ?? innerHeight];
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const focal = focalOf(camera, height);
  const { near, far } = aim(camera, laid.clusters, laid.clusters[chosen]);
  if (web === undefined) {
    glided(performance.now());
    look.frame({ camera, width, height, focal, near, far, chosen, target: laid.clusters[chosen] });
    labels.place(camera, chosen);
  } else {
    web.advance({ x: 0, y: 0, z: 0 }, 0, 1);
    web.group.position.set(0, 0, 0);
    web.group.rotation.x = 0;
    web.look({ eye: camera.position, focal, focus: (near + far) / 2 }, Date.now());
  }
  renderer.info.reset();
  render();
  canvas?.setAttribute("data-drawn", "true");
}

let asked = false;
function ask(): void {
  if (asked) return;
  asked = true;
  requestAnimationFrame(() => {
    asked = false;
    draw();
  });
}

tuningPanel(ask, studied(stand));
stand();
addEventListener("resize", ask);
addEventListener("pointermove", ({ buttons, movementX, movementY, clientX, clientY }) => {
  if (buttons === 0) {
    labels.hover(camera, clientX, clientY);
    return;
  }
  values.yaw -= movementX * 0.005;
  values.pitch = Math.max(-1.4, Math.min(1.4, values.pitch + movementY * 0.005));
  ask();
});
addEventListener("click", ({ clientX, clientY }) => {
  const picked = labels.at(clientX, clientY);
  if (picked === undefined) return;
  chosen = picked;
  ask();
});
addEventListener("wheel", ({ deltaY }) => {
  values.distance = Math.max(10, Math.min(1600, (values.distance || 300) * Math.exp(deltaY * 0.001)));
  ask();
});

Reflect.set(globalThis, "__study", {
  cost: (count: number) => {
    draw();
    return frameCost(renderer, render, count);
  },
  choose: (name: string) => {
    chosen = Math.max(
      0,
      laid.clusters.findIndex(({ id }) => id === name),
    );
    draw();
  },
  card: () => {
    const target = laid.clusters[chosen];
    if (target !== undefined)
      labels.card(target, onScreen(camera, target.centre).x + 40, onScreen(camera, target.centre).y + 40);
  },
  set: (name: Name, value: number) => {
    if (setValue(name, value)) stand();
    glide = undefined;
    draw();
  },
  // A world more in `namespace`, gliding (`still` false) or at its end at once, for the before and after pictures.
  add: (namespace: string, still: boolean) => {
    const name = laid.clusters[chosen]?.id;
    added += 1;
    namespaces = withWorld(namespaces, namespace, added);
    stand();
    chosen = Math.max(
      0,
      laid.clusters.findIndex(({ id }) => id === name),
    );
    if (still) glide = undefined;
    draw();
  },
  stats: () => ({
    particles: web?.count ?? laid.count,
    real: laid.clusters.reduce((sum, { real }) => sum + real, 0),
    clusters: laid.clusters.length,
    chosen: laid.clusters[chosen]?.id,
    calls: renderer.info.render.calls,
    ratio: renderer.getPixelRatio(),
    first: laid.clusters.slice(0, 8).map(({ id, real, radius, centre }) => ({
      id: id.slice(0, 14),
      real,
      radius: Math.round(radius * 10) / 10,
      fromEarth: Math.round(centre.length()),
    })),
  }),
});
draw();
