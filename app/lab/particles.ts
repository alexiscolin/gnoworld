// The whole cosmos as a cloud of particles in clusters, a study for Alexis's yes before any product code (7u; decisions, 2026-11-04): each
// world of the recorded file one soft particle with a depth of field, clustered by its namespace and the placement (particlesLayout.ts), the
// chosen cluster lit in gold with its rings and a line of light (particlesLook.ts). Its values are the panel's "Study" section.
// `before=1` draws the product's whole cosmos (web.ts) from the same eye, so one probe weighs a frame of each; `tier=low`, the weak tier.
import { pixelRatioFor, systemsOf, type Tier } from "@gnoworld/core";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import { heldOf as placesOf, usageOf } from "../src/scene/cosmos/cosmosWorld.ts";
import { Web } from "../src/scene/cosmos/web.ts";
import { heldOf } from "../src/scene/cosmos/webHeld.ts";
import { focalOf } from "../src/scene/lens.ts";
import { createRenderer } from "../src/scene/renderer.ts";
import { LENS } from "../src/scene/viewport.ts";
import read from "./imports.json" with { type: "json" };
import { linked } from "./linked.ts";
import { tuningPanel } from "./panel.ts";
import { Labels, onScreen } from "./particlesLabels.ts";
import { laidOut, type Data } from "./particlesLayout.ts";
import { Look } from "./particlesLook.ts";
import { frameCost } from "./probes.ts";
import { setValue, studied, values, type Name } from "./particlesValues.ts";
import { starField } from "./sky.ts";
import recorded from "./worlds.json" with { type: "json" };

const params = new URLSearchParams(location.search);
const tier: Tier = params.get("tier") === "low" ? "low" : "high";
const before = params.get("before") === "1";

const file = linked(recorded, read);
const systems = systemsOf(placesOf(file.worlds));
const data: Data = {
  systems,
  worlds: file.worlds,
  ...heldOf(systems, file.worlds),
  useOf: new Map(file.worlds.map((world) => [world.id, usageOf(world)])),
};

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
const labels = new Labels(file.worlds);
const web = before ? new Web() : undefined;
let laid = laidOut(data);
let chosen = Math.max(
  0,
  laid.clusters.findIndex(({ head }) => head.id === params.get("chosen")),
);

function stand(): void {
  if (web !== undefined) {
    web.resize(ratio);
    web.stand({ systems, worlds: file.worlds, written: file.updated }, Date.now());
    stage.add(web.group);
    return;
  }
  laid = laidOut(data);
  look.stand(laid);
  labels.stand(laid.clusters);
  stage.add(look.group);
}

// The eye looks at the cloud's weighted middle, drawn towards the chosen cluster, and focuses on that cluster.
function aim(): { target: Vector3; focus: number } {
  const target = laid.clusters[chosen];
  const middle = laid.clusters.reduce((sum, { centre, worlds }) => sum.addScaledVector(centre, worlds), new Vector3());
  middle.divideScalar(Math.max(1, laid.count - 1)).lerp(target?.centre ?? middle, values.aim);
  const { distance, pitch, yaw } = values;
  const eye = new Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  camera.position.copy(middle).addScaledVector(eye, distance);
  camera.lookAt(middle);
  camera.updateMatrixWorld();
  return {
    target: middle,
    focus: (target === undefined ? distance : camera.position.distanceTo(target.centre)) * values.focusShare,
  };
}

function draw(): void {
  const [width, height] = [canvas?.clientWidth ?? innerWidth, canvas?.clientHeight ?? innerHeight];
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const focal = focalOf(camera, height);
  const { focus } = aim();
  if (web === undefined) {
    look.frame({ camera, width, height, focal, focus, chosen, target: laid.clusters[chosen] });
    labels.place(camera, chosen);
  } else {
    web.advance({ x: 0, y: 0, z: 0 }, 0, 1);
    web.group.position.set(0, 0, 0);
    web.group.rotation.x = 0;
    web.look({ eye: camera.position, focal, focus }, Date.now());
  }
  renderer.info.reset();
  renderer.render(stage, camera);
  canvas?.setAttribute("data-drawn", "true");
}

let asked = false;
const ask = () => {
  if (asked) return;
  asked = true;
  requestAnimationFrame(() => {
    asked = false;
    draw();
  });
};

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
  values.distance = Math.max(30, Math.min(1600, values.distance * Math.exp(deltaY * 0.001)));
  ask();
});

// A frame's cost as the realism page's probe weighs it, its uniforms and labels set once.
function cost(count: number): number {
  draw();
  return frameCost(
    renderer,
    () => {
      renderer.render(stage, camera);
    },
    count,
  );
}

Reflect.set(globalThis, "__study", {
  cost,
  choose: (name: string) => {
    chosen = Math.max(
      0,
      laid.clusters.findIndex(({ head }) => head.id === name),
    );
    draw();
  },
  card: () => {
    const target = laid.clusters[chosen];
    if (target === undefined) return;
    const { x, y } = onScreen(camera, target.centre);
    labels.card(target, x + 40, y + 40);
  },
  set: (name: Name, value: number) => {
    if (setValue(name, value)) stand();
    draw();
  },
  stats: () => ({
    particles: web?.count ?? laid.count,
    clusters: laid.clusters.filter(({ worlds }) => worlds >= values.clusterLeast).length,
    alone: laid.clusters.filter(({ worlds }) => worlds < values.clusterLeast).length,
    chosen: laid.clusters[chosen]?.head.id,
    calls: renderer.info.render.calls,
    ratio: renderer.getPixelRatio(),
    sizes: laid.clusters.slice(0, 16).map(({ head, worlds, members, radius }) => ({
      head: head.id.slice(0, 14),
      worlds,
      members: members.length,
      radius: Math.round(radius * 10) / 10,
    })),
  }),
});
draw();
