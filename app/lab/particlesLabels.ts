// The study's labels (particles.ts): the video's pills, the cosmos's own (labels.module.css), over each clump with a few particles and
// the Earth, its worlds in amber figures; the chosen's ringed in gold; one that would cover another stays hidden, the chosen first. A card
// opens on a hover of a clump, never of its dust: its name, then its worlds, realms and packages.
import { Vector3, type PerspectiveCamera } from "three";
import styles from "../src/scene/cosmos/labels.module.css";
import type { Cluster, Namespace } from "./particlesLayout.ts";

const GAP = 6;
const PICK_PX = 70;
const LABELLED = 12;

interface Label {
  readonly box: HTMLElement;
  readonly cluster: number;
}

const made = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = "") =>
  Object.assign(document.createElement(tag), { textContent: text, className });
const shortOf = (name: string) => (name.startsWith("g1") ? `${name.slice(0, 6)}…${name.slice(-4)}` : name);
const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right + GAP && a.right > b.left - GAP && a.top < b.bottom + GAP && a.bottom > b.top - GAP;

/** Where a place falls on the page, and whether it is ahead of the eye. */
export function onScreen(camera: PerspectiveCamera, at: Vector3): { x: number; y: number; seen: boolean } {
  const projected = at.clone().project(camera);
  return { x: ((projected.x + 1) * innerWidth) / 2, y: ((1 - projected.y) * innerHeight) / 2, seen: projected.z < 1 };
}

const plural = (count: number, word: string) => `${String(count)} ${word}${count === 1 ? "" : "s"}`;
// Its worlds, or for a namespace of packages alone, its packages.
const countOf = ({ worlds, real }: Cluster) => (worlds === 0 ? plural(real, "package") : plural(worlds, "world"));

function pill(title: string, count: string): HTMLElement {
  const box = made("div", "", `${styles["placed"] ?? ""} ${styles["label"] ?? ""}`);
  box.append(made("span", title, styles["title"] ?? ""));
  if (count !== "") box.append(made("span", count, styles["count"] ?? ""));
  return box;
}

export class Labels {
  readonly #layer = made("div", "", styles["layer"] ?? "");
  readonly #card = Object.assign(made("div", "", "study-card"), { hidden: true });
  #labels: Label[] = [];
  #clusters: readonly Cluster[] = [];
  #namespaces = new Map<string, Namespace>();

  constructor() {
    document.body.append(this.#layer, this.#card);
  }

  /** A pill for each clump of a few particles, and the Earth's. */
  stand(clusters: readonly Cluster[], namespaces: readonly Namespace[]): void {
    this.#clusters = clusters;
    this.#namespaces = new Map(namespaces.map((one) => [one.id, one]));
    this.#layer.replaceChildren();
    this.#labels = clusters.flatMap((cluster, index) => {
      if (cluster.real < LABELLED) return [];
      const box = pill(shortOf(cluster.id), countOf(cluster));
      this.#layer.append(box);
      return [{ box, cluster: index }];
    });
    const earth = pill("Earth", "");
    this.#layer.append(earth);
    this.#labels.push({ box: earth, cluster: -1 });
  }

  /** Each pill over its clump, the chosen's first, any that would cover one already placed hidden. */
  place(camera: PerspectiveCamera, chosen: number): void {
    const taken: DOMRect[] = [];
    const order = [...this.#labels].sort((a, b) => Number(b.cluster === chosen) - Number(a.cluster === chosen));
    for (const { box, cluster } of order) {
      const one = this.#clusters[cluster];
      const lift = new Vector3(0, one === undefined ? 2 : one.radius * 0.7, 0);
      const { x, y, seen } = onScreen(camera, (one?.centre ?? new Vector3()).clone().add(lift));
      box.classList.toggle("study-chosen", cluster === chosen);
      box.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px) translate(-50%, -100%)`;
      box.style.display = "";
      const rect = box.getBoundingClientRect();
      // The pill's own display beats the hidden attribute: it goes by its style.
      box.hidden = !seen || taken.some((other) => overlaps(rect, other));
      box.style.display = box.hidden ? "none" : "";
      box.style.pointerEvents = box.hidden ? "none" : "auto";
      if (!box.hidden) taken.push(rect);
    }
  }

  /** The clump whose pill the page's point `x`, `y` falls in, or none. */
  at(x: number, y: number): number | undefined {
    const picked = this.#labels.find(({ box }) => {
      const rect = box.getBoundingClientRect();
      return !box.hidden && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
    return picked === undefined || picked.cluster < 0 ? undefined : picked.cluster;
  }

  /** The card of the clump nearest the pointer at `x`, `y`, or none. */
  hover(camera: PerspectiveCamera, x: number, y: number): void {
    let near: Cluster | undefined;
    let best = PICK_PX;
    for (const cluster of this.#clusters) {
      const shown = onScreen(camera, cluster.centre);
      const gap = Math.hypot(shown.x - x, shown.y - y);
      if (shown.seen && gap < best) [best, near] = [gap, cluster];
    }
    if (near === undefined) this.#card.hidden = true;
    else this.card(near, x, y);
  }

  /** The card of `cluster`, beside the page's point `x`, `y`. */
  card(cluster: Cluster, x: number, y: number): void {
    const one = this.#namespaces.get(cluster.id);
    const realms = one?.worlds.reduce((sum, { realms: held }) => sum + held.length, 0) ?? 0;
    const list = made("dl");
    for (const [key, value] of [
      ["Worlds", cluster.worlds],
      ["Realms", realms],
      ["Packages", one?.packages.length ?? 0],
    ] as const)
      list.append(made("dt", key), made("dd", String(value)));
    this.#card.replaceChildren(made("h3", `${shortOf(cluster.id)}/`), list);
    this.#card.style.left = `${String(Math.round(x + 18))}px`;
    this.#card.style.top = `${String(Math.round(y - 12))}px`;
    this.#card.hidden = false;
  }
}
