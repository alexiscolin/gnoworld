// The close stations' names and the caption over their group (part 7x2; frame 4's "Built and curated", "Curated" as half are other teams'): each
// name over its station, a link to the project's own address, or to its world's page where the file names one, and the hand only then; the
// caption over the names, where the stations group. Over the canvas, under the page's text, in the labels' layer.
import { clearOf, type ClearBox } from "@gnoworld/core";
import { OPEN } from "../openEvent.ts";
import labelStyles from "../cosmos/labels.module.css";
import { Placed } from "../cosmos/placed.ts";
import planStyles from "../cosmos/orbits.module.css";
import { external, linkable } from "../cosmos/planWords.ts";
import { watchScene } from "../cosmos/sceneRuns.ts";
import styles from "./names.module.css";

/** The canvas's size in its CSS pixels, its lens in them, and the box of the page's text, which no name stands under. */
export interface Sight {
  readonly width: number;
  readonly height: number;
  readonly focal: number;
  readonly box?: ClearBox | undefined;
}

/** Where a station stands on the screen this frame, in its pixels, and its reach there; `shown`, false behind the eye or off the screen. */
export interface Spot {
  x: number;
  y: number;
  radius: number;
  shown: boolean;
}

/** A station's name as the file gives it, and where it leads: its world's page by its slug, else its own address. */
export interface Named {
  readonly name: string;
  readonly url: string;
  readonly slug?: string | undefined;
}

// Pixels between a station's outline and its name's foot, and from the highest name's foot to the caption's: a name's line and air.
const OVER = 6;
const CAPTION_GAP = 34;
// The header's band, which the caption keeps off; a name's and the caption's reach round their middle, kept off the page's text.
const HEADER = 96;
const NAME_REACH = 50;
const LINE = 16;
// Half the caption's width and a margin: its centre stays this far in from the screen's sides.
const HALF_CAPTION = 150;

const hrefOf = ({ url, slug }: Named): string | undefined => {
  const href = slug === undefined ? url : `/w/${slug}`;
  return linkable(href) ? href : undefined;
};

export class StationNames {
  readonly #layer: HTMLElement;
  readonly #caption: HTMLElement;
  #names: HTMLElement[] = [];
  readonly #placed = new Placed();
  readonly #captionPlaced = new Placed();
  // The caption's strength, written only when it changed.
  #strength = NaN;
  // The shown names' highest foot and their extent across, this frame.
  readonly #bounds = { top: Infinity, left: Infinity, right: -Infinity };
  readonly #probe = { x: 0, y: 0, radius: 0 };
  // The page's text's box this frame.
  #box: ClearBox | undefined;
  // Shown while asked and while the scene's canvas runs: a covered page or a lost context stops the frames that would hide them.
  #wanted = false;
  #running = true;
  readonly #watching: MutationObserver | undefined;

  constructor(document: Document) {
    this.#layer = document.createElement("nav");
    this.#layer.className = `${labelStyles["layer"] ?? ""} ${planStyles["plan"] ?? ""} ${styles["layer"] ?? ""}`;
    this.#layer.setAttribute("aria-label", "The stations round the Earth");
    this.#caption = document.createElement("div");
    this.#caption.className = `${labelStyles["placed"] ?? ""} ${styles["caption"] ?? ""}`;
    const title = Object.assign(document.createElement("p"), { className: "label", textContent: "Stations" });
    const line = Object.assign(document.createElement("p"), {
      className: styles["line"] ?? "",
      textContent: "Curated by the gno.land team",
    });
    this.#caption.append(title, line);
    this.#captionPlaced.set([this.#caption]);
    this.show(false);
    document.body.append(this.#layer);
    this.#watching = watchScene(document, (running) => {
      this.#running = running;
      this.show(this.#wanted);
    });
  }

  /** Names `named`, in place of what was named. */
  name(named: readonly Named[]): void {
    const document = this.#layer.ownerDocument;
    this.#names = named.map((one) => {
      const href = hrefOf(one);
      const name = document.createElement(href === undefined ? "span" : "a");
      name.className = `${labelStyles["placed"] ?? ""} ${planStyles["name"] ?? ""} ${styles["name"] ?? ""}`;
      name.textContent = one.name;
      if (name instanceof HTMLAnchorElement && href !== undefined) {
        name.href = href;
        if (external(href)) Object.assign(name, { target: "_blank", rel: "noopener noreferrer" });
        else
          name.addEventListener("click", (event) => {
            this.#own(event, href);
          });
      }
      return name;
    });
    this.#placed.set(this.#names);
    this.#layer.replaceChildren(...this.#names, this.#caption);
  }

  // A world's page goes through the site's router (features/universe/ViewSwitch.tsx); a click with a modifier is the reader's own tab.
  #own(event: MouseEvent, href: string): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.dispatchEvent(new CustomEvent(OPEN, { detail: href }));
  }

  /** Shows the names or not, fading; none while the scene's canvas stands still. */
  show(shown: boolean): void {
    this.#wanted = shown;
    this.#layer.classList.toggle(styles["shown"] ?? "", shown && this.#running);
  }

  /** Each name over its station at `spots`, and the caption over them at `caption` of its strength, its centre kept within `width`: as the
   * eye rises to the top view it gives way. */
  place(spots: readonly Spot[], caption: number, { width, box }: { width: number; box: ClearBox | undefined }): void {
    const bounds = this.#bounds;
    bounds.top = Infinity;
    bounds.left = Infinity;
    bounds.right = -Infinity;
    this.#box = box;
    for (let at = 0; at < spots.length; at += 1) this.#nameAt(at, spots[at]);
    this.#placeCaption(caption, width);
  }

  // A name over its station, or hidden, off the page's text, the names' bounds grown by it.
  #nameAt(at: number, spot: Spot | undefined): void {
    const name = this.#names[at];
    if (spot === undefined || name === undefined) return;
    const y = spot.y - spot.radius - OVER;
    const shown = spot.shown && this.#clear(spot.x, y - LINE / 2, NAME_REACH);
    if (name.hidden === shown) name.hidden = !shown;
    if (!shown) return;
    this.#placed.place(at, spot.x, y);
    this.#bounds.top = Math.min(this.#bounds.top, y);
    this.#bounds.left = Math.min(this.#bounds.left, spot.x);
    this.#bounds.right = Math.max(this.#bounds.right, spot.x);
  }

  // Whether a round thing of `reach` round `x`, `y` stands off the page's text.
  #clear(x: number, y: number, reach: number): boolean {
    this.#probe.x = x;
    this.#probe.y = y;
    this.#probe.radius = reach;
    return this.#box === undefined || clearOf(this.#probe, this.#box) > 0;
  }

  // The caption over the names' middle, off the header and the page's text, at `caption` of its strength, written only when it changed.
  #placeCaption(caption: number, width: number): void {
    const { top, left, right } = this.#bounds;
    const middle = Math.min(Math.max((left + right) / 2, HALF_CAPTION), width - HALF_CAPTION);
    const y = Math.max(top - CAPTION_GAP, HEADER);
    const hidden = !Number.isFinite(top) || caption <= 0 || !this.#clear(middle, y - 2 * LINE, HALF_CAPTION);
    if (this.#caption.hidden !== hidden) this.#caption.hidden = hidden;
    if (hidden) return;
    const strength = Math.round(caption * 100) / 100;
    if (strength !== this.#strength) this.#caption.style.setProperty("opacity", String(strength));
    this.#strength = strength;
    this.#captionPlaced.place(0, middle, y);
  }

  dispose(): void {
    this.#watching?.disconnect();
    this.#layer.remove();
  }
}
