// The Earth's view (part 7x2): its stations and scenery come in a chunk of their own once the cosmos first shows, so the cosmos's chunk pays
// only for these calls and a phone loads none of it before "View in space"; the scenery's maps after that.
import type { Point } from "@gnoworld/core";
import { Group, type Material } from "three";
import type { Disposer } from "../disposer.ts";
import type { EarthDevice } from "../earth/device.ts";

const loadView = () => import("../station/earthView.ts");
type View = ReturnType<Awaited<ReturnType<typeof loadView>>["siteEarthView"]>;
type Sight = Parameters<Awaited<ReturnType<typeof loadView>>["siteEarthView"]>[1];

export class LazyEarthView {
  /** Where it stands once it has come: beside the Earth, which holds it among the bodies, so it shows and hides with them. */
  readonly group = new Group();
  readonly #device: EarthDevice;
  readonly #owner: Disposer;
  #view: View | undefined;
  #asked = false;
  readonly #sight: Sight;
  #wanted = false;
  // The Earth's ring's covering, which the view keeps off the page's text once it came.
  #ring: Material | undefined;

  /** On `device`, owned by `owner`, over a canvas of `sight`. */
  constructor(device: EarthDevice, owner: Disposer, sight: Sight) {
    this.#device = device;
    this.#owner = owner;
    this.#sight = sight;
    owner.add({ dispose: () => this.#view?.dispose() });
  }

  /** Stands it, the first time asking for its chunk; a chunk that does not come leaves the Earth alone. */
  stand(): void {
    this.#wanted = true;
    this.#view?.stand();
    if (this.#asked) return;
    this.#asked = true;
    loadView().then(
      ({ siteEarthView }) => {
        if (this.#owner.signal.aborted) return;
        const view = siteEarthView(this.#device, this.#sight);
        this.#view = view;
        this.group.add(view.group);
        if (this.#ring !== undefined) view.keepOff(this.#ring);
        if (this.#wanted) view.stand();
      },
      () => undefined,
    );
  }

  /** Keeps what `material` draws, the Earth's ring, off the page's text, as the view's own lines, once the view's chunk came. */
  keepOff(material: Material): void {
    this.#ring = material;
    this.#view?.keepOff(material);
  }

  /** A frame, as the view's own. */
  tick(eye: Point, seconds: number, shown: boolean): void {
    this.#view?.tick(eye, seconds, shown);
  }

  /** Its names off the page, as the cosmos goes. */
  hide(): void {
    this.#view?.hide();
  }

  /** Frees it and its maps; a stand brings it again. */
  drop(): void {
    this.#wanted = false;
    this.#view?.drop();
  }

  /** What stands, for the journeys: nothing till it came. */
  stats() {
    return this.#view?.stats();
  }
}
