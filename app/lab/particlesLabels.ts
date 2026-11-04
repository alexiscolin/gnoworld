// The study's labels (particles.ts): a dark box in mono type over each cluster's head and the Earth, its short id beside, the chosen's in
// gold; one that would cover another stays hidden, the chosen first. A card opens on a hover: the cluster's name, then a few facts.
import type { Worlds } from "@gnoworld/schemas/indexer";
import { Vector3, type PerspectiveCamera } from "three";
import { earthAt, type Cluster } from "./particlesLayout.ts";
import { values } from "./particlesValues.ts";

const GAP = 6;
const PICK_PX = 70;

interface Label {
  readonly box: HTMLElement;
  readonly name: HTMLElement;
  readonly cluster: number;
}

const made = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = "") =>
  Object.assign(document.createElement(tag), { textContent: text, className });
const shortOf = (name: string) => (name.startsWith("g1") ? `${name.slice(0, 6)}…${name.slice(-4)}` : name);
const tagOf = (name: string, count: number) => `${name.replace(/^(g1|nym-)/, "").slice(0, 3)}:${String(count)}`;
const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right + GAP && a.right > b.left - GAP && a.top < b.bottom + GAP && a.bottom > b.top - GAP;

/** Where a place falls on the page, and whether it is ahead of the eye. */
export function onScreen(camera: PerspectiveCamera, at: Vector3): { x: number; y: number; seen: boolean } {
  const projected = at.clone().project(camera);
  return { x: ((projected.x + 1) * innerWidth) / 2, y: ((1 - projected.y) * innerHeight) / 2, seen: projected.z < 1 };
}

export class Labels {
  readonly #layer = made("div", "", "study-labels");
  readonly #card = Object.assign(made("div", "", "study-card"), { hidden: true });
  readonly #worlds: Worlds["worlds"];
  #labels: Label[] = [];
  #clusters: readonly Cluster[] = [];

  constructor(worlds: Worlds["worlds"]) {
    this.#worlds = worlds;
    document.body.append(this.#layer, this.#card);
  }

  /** A label for each cluster of a few worlds, and the Earth's. */
  stand(clusters: readonly Cluster[]): void {
    this.#clusters = clusters;
    this.#layer.replaceChildren();
    this.#labels = clusters.flatMap((cluster, index) => {
      if (cluster.worlds < values.clusterLeast) return [];
      const [box, name] = [made("div", "", "study-label"), made("b", `${shortOf(cluster.head.id)}/`)];
      box.append(name, made("small", tagOf(cluster.head.id, cluster.worlds)));
      this.#layer.append(box);
      return [{ box, name, cluster: index }];
    });
    const [earth, name] = [made("div", "", "study-label"), made("b", "Earth")];
    earth.append(name);
    this.#layer.append(earth);
    this.#labels.push({ box: earth, name, cluster: -1 });
  }

  /** Each label over its cluster, the chosen's first and in gold, any that would cover one already placed hidden. */
  place(camera: PerspectiveCamera, chosen: number): void {
    const taken: DOMRect[] = [];
    const order = [...this.#labels].sort((a, b) => Number(b.cluster === chosen) - Number(a.cluster === chosen));
    for (const { box, name, cluster } of order) {
      const one = this.#clusters[cluster];
      const lift = new Vector3(0, one === undefined ? 3 : one.radius * 0.8, 0);
      const { x, y, seen } = onScreen(camera, (one?.centre ?? earthAt()).clone().add(lift));
      box.classList.toggle("chosen", cluster === chosen);
      if (one !== undefined) name.textContent = `${shortOf(one.head.id)}/${cluster === chosen ? " · CHOSEN" : ""}`;
      box.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px) translate(-50%, -100%)`;
      box.hidden = false;
      const rect = box.getBoundingClientRect();
      box.hidden = !seen || taken.some((other) => overlaps(rect, other));
      if (!box.hidden) taken.push(rect);
    }
  }

  /** The cluster whose label the page's point `x`, `y` falls in, or none. */
  at(x: number, y: number): number | undefined {
    const picked = this.#labels.find(({ box }) => {
      const rect = box.getBoundingClientRect();
      return !box.hidden && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
    return picked === undefined || picked.cluster < 0 ? undefined : picked.cluster;
  }

  /** The card of the cluster nearest the pointer at `x`, `y`, or none. */
  hover(camera: PerspectiveCamera, x: number, y: number): void {
    let near: Cluster | undefined;
    let best = PICK_PX;
    for (const cluster of this.#clusters) {
      if (cluster.worlds < values.clusterLeast) continue;
      const shown = onScreen(camera, cluster.centre);
      const gap = Math.hypot(shown.x - x, shown.y - y);
      if (shown.seen && gap < best) [best, near] = [gap, cluster];
    }
    if (near === undefined) this.#card.hidden = true;
    else this.card(near, x, y);
  }

  /** The card of `cluster`, beside the page's point `x`, `y`. */
  card(cluster: Cluster, x: number, y: number): void {
    const list = made("dl");
    for (const [key, value] of this.#factsOf(cluster)) list.append(made("dt", key), made("dd", value));
    this.#card.replaceChildren(made("h3", `${shortOf(cluster.head.id)}/`), list);
    this.#card.style.left = `${String(Math.round(x + 18))}px`;
    this.#card.style.top = `${String(Math.round(y - 12))}px`;
    this.#card.hidden = false;
  }

  #factsOf(cluster: Cluster): [string, string][] {
    const ids = new Set(cluster.members.flatMap(({ worlds }) => worlds.map(({ id }) => id)));
    const realms = this.#worlds.filter(({ id }) => ids.has(id)).flatMap((world) => world.realms);
    const deployers = new Set(realms.map(({ deployer }) => deployer).filter((one) => one !== null));
    return [
      ["Worlds", String(cluster.worlds)],
      ["Namespaces", String(cluster.members.length)],
      ["Realms", String(realms.length)],
      ["Deployers", deployers.size === 0 ? "not in the file" : String(deployers.size)],
    ];
  }
}
