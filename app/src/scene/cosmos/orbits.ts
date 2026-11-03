// A Plan on the stage (part 7v; Alexis, 2026-11-03), in a chunk of its own the cosmos's labels ask once a look holds one: the only view that
// draws orbits, an ellipse round the star for each world's, in one draw; and each world's name under it, in the file's words, a link to its
// page where it has one, an amber dot where people are. A first click names a world, a second goes there: the page's router for the site's
// own pages, a tab of its own for a hand-made project's address. All a Plan needs is here, so the chunks every home loads pay none of it.
import type { Planned, Point } from "@gnoworld/core";
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Vector3, type Object3D } from "three";
import { OPEN } from "../openEvent.ts";
import type { Projector } from "./labels.ts";
import labelStyles from "./labels.module.css";
import styles from "./orbits.module.css";
import { external, linkable, namedOf, type Named, type Words } from "./planWords.ts";
import { watchScene } from "./sceneRuns.ts";

export type { Words } from "./planWords.ts";

// The names a step under their worlds' outlines.
const UNDER = 8;
// The mock-up's orbits: the text's muted grey at a sixth.
const LINE = { color: 0xc8d0de, opacity: 0.16 };

// The site's router follows a world to its page: the page's views listen (features/universe/ViewSwitch.tsx).
const openPage = (href: string) => {
  window.dispatchEvent(new CustomEvent(OPEN, { detail: href }));
};

// The design system's dot in its warm tone (utilities.css), before a world where people are.
const warmDot = (document: Document) => {
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.dataset["tone"] = "warm";
  dot.setAttribute("aria-hidden", "true");
  return dot;
};

export class Orbits {
  readonly #lines: LineSegments<BufferGeometry, LineBasicMaterial>;
  readonly #layer: HTMLElement;
  readonly #projector: Pick<Projector, "seen" | "fromEye">;
  readonly #open: (href: string) => void;
  readonly #at = new Vector3();
  // Where each name was written last, across and down, in the page's pixels to a tenth: a name is written only when it moved.
  #written = new Float64Array(0);
  #plan: Named | undefined;
  #shown: { plan: Planned | undefined; words: Words | undefined } = { plan: undefined, words: undefined };
  #names: HTMLAnchorElement[] = [];
  #named: HTMLAnchorElement | undefined;
  // The layer shows while a Plan is shown, the frames run, and the scene's canvas does: the page stays over other routes (7v's review).
  #running = true;
  #ticking = false;
  readonly #watching: MutationObserver | undefined;

  /** In `parent`, whose origin is the eye; its names in `document`, placed by `projector`; `open` takes a site's page's address, by default
   * an event the page's router reads. */
  constructor(
    parent: Object3D,
    document: Document,
    { projector, open = openPage }: { projector: Pick<Projector, "seen" | "fromEye">; open?: (href: string) => void },
  ) {
    this.#projector = projector;
    this.#open = open;
    this.#lines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ ...LINE, transparent: true, depthWrite: false }),
    );
    this.#lines.frustumCulled = false;
    this.#lines.visible = false;
    parent.add(this.#lines);
    this.#layer = document.createElement("nav");
    this.#layer.className = `${labelStyles["layer"] ?? ""} ${styles["plan"] ?? ""}`;
    this.#layer.setAttribute("aria-label", "The worlds of the Plan");
    this.#layer.dataset["plan"] = "";
    this.#layer.hidden = true;
    document.body.append(this.#layer);
    this.#watching = watchScene(document, (running) => {
      this.#running = running;
      this.#hide();
    });
  }

  #hide(): void {
    this.#layer.hidden = !(this.#running && this.#ticking && this.#plan !== undefined);
  }

  /** Draws `plan` in the file's `words`, or takes it away with none; the same Plan and words, nothing new. */
  show(planned: Planned | undefined, words: Words): void {
    if (
      planned === this.#shown.plan &&
      words.worlds === this.#shown.words?.worlds &&
      words.signals === this.#shown.words.signals
    )
      return;
    const kept = planned === this.#shown.plan;
    this.#shown = { plan: planned, words };
    const plan = planned === undefined ? undefined : namedOf(planned, words);
    this.#plan = plan;
    // The same Plan in new words (a minute's presence): each name kept, its naming and its focus with it (7v's review).
    if (kept && plan !== undefined) {
      this.#rewrite(plan);
      return;
    }
    this.#lines.visible = plan !== undefined;
    this.#named = undefined;
    this.#names = plan === undefined ? [] : plan.worlds.map(({ id }) => this.#nameOf(plan, id));
    this.#written = new Float64Array(2 * this.#names.length).fill(NaN);
    this.#layer.replaceChildren(...this.#names);
    this.#hide();
    if (plan !== undefined) this.#ellipses(plan);
  }

  // Each world's orbit, its ring of points round the star on the map, from the star on the stage (the map turned, toScene being linear):
  // the lines stand at the star, so a frame moves one place.
  #ellipses({ rings }: Planned): void {
    const none = { x: 0, y: 0, z: 0 };
    const origin = this.#projector.fromEye(none, none, new Vector3());
    const points: number[] = [];
    const push = (at: Point) => {
      this.#projector.fromEye(at, none, this.#at).sub(origin);
      points.push(this.#at.x, this.#at.y, this.#at.z);
    };
    for (const ring of rings)
      ring.forEach((at, step) => {
        push(at);
        push(ring[(step + 1) % ring.length] ?? at);
      });
    this.#lines.geometry.dispose();
    this.#lines.geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(points, 3));
  }

  #nameOf(plan: Named, id: string): HTMLAnchorElement {
    const name = this.#layer.ownerDocument.createElement("a");
    name.className = `${labelStyles["placed"] ?? ""} ${styles["name"] ?? ""}`;
    this.#word(plan, id, name);
    name.addEventListener("click", (event) => {
      this.#click(event, name);
    });
    return name;
  }

  #rewrite(plan: Named): void {
    plan.worlds.forEach(({ id }, at) => {
      const name = this.#names[at];
      if (name !== undefined) this.#word(plan, id, name);
    });
  }

  // A name's words, link and dot, in the file's words: written in place again when only those change.
  #word(plan: Named, id: string, name: HTMLAnchorElement): void {
    name.textContent = plan.names.get(id) ?? id;
    const given = plan.links.get(id);
    const href = linkable(given) ? given : undefined;
    if (href === undefined) name.removeAttribute("href");
    else name.href = href;
    if (href !== undefined && external(href)) Object.assign(name, { target: "_blank", rel: "noopener noreferrer" });
    else for (const attribute of ["target", "rel"]) name.removeAttribute(attribute);
    if (plan.here.has(id)) name.prepend(warmDot(this.#layer.ownerDocument));
  }

  // A first click names the world; a second goes: through the router for the site's own page, by the link itself for a project's. A click
  // with a modifier or the middle button is the reader's own way to a tab, which the browser keeps.
  #click(event: MouseEvent, name: HTMLAnchorElement): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (this.#named !== name) {
      event.preventDefault();
      this.#named?.removeAttribute("aria-current");
      this.#named = name;
      name.setAttribute("aria-current", "true");
      return;
    }
    const href = name.getAttribute("href");
    if (href === null || external(href)) return;
    event.preventDefault();
    this.#open(href);
  }

  /** A frame: the ellipses at their star, each name under its world, from `eye` on the stage, none for a world behind the eye; nothing
   * while the scene is not `shown`. */
  tick(eye: Point, shown = true): void {
    this.#ticking = shown;
    this.#hide();
    const plan = this.#plan;
    if (plan === undefined || this.#layer.hidden) return;
    this.#lines.position.copy(this.#projector.fromEye(plan.system.place, eye, this.#at));
    for (let at = 0; at < this.#names.length; at += 1) {
      const name = this.#names[at];
      const world = plan.worlds[at];
      const place = plan.places[at];
      if (name === undefined || world === undefined || place === undefined) continue;
      const spot = this.#projector.seen(this.#projector.fromEye(place, eye, this.#at), world.radius);
      name.hidden = spot.depth <= 0;
      this.#placeName(at, spot.x, spot.y + spot.radius + UNDER);
    }
  }

  #placeName(at: number, x: number, y: number): void {
    const [left, top] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    if (this.#written[2 * at] === left && this.#written[2 * at + 1] === top) return;
    this.#written[2 * at] = left;
    this.#written[2 * at + 1] = top;
    this.#names[at]?.style.setProperty("transform", "translate(" + String(left) + "px, " + String(top) + "px)");
  }

  /** Off the stage and the page, its buffers and program freed. */
  dispose(): void {
    this.#watching?.disconnect();
    this.#lines.removeFromParent();
    this.#lines.geometry.dispose();
    this.#lines.material.dispose();
    this.#layer.remove();
  }
}
