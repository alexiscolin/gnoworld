// What the scene is told of the default universe's worlds. The fixed places stand at once, and the file joins them when it comes, if it does,
// read once; the page's text keeps its room at any size, its box measured on the page, as the globe's circle is.
import { readWorlds } from "../../lib/chain/realms.ts";
import type { CosmosWorld } from "../../scene/cosmos/cosmos.ts";
import type { Scene } from "../../scene/scene.ts";

export class WorldsFeed {
  readonly #leaving = new AbortController();
  #worlds: readonly CosmosWorld[] = [];
  #asked = false;
  #shown = false;
  #clearing: AbortController | undefined;

  /** Says whether the page wants the worlds on `scene`. */
  sync(scene: Scene, wanted: boolean): void {
    if (wanted === this.#shown) return;
    this.#shown = wanted;
    scene.cosmos(wanted ? this.#worlds : undefined);
    this.#clearing?.abort();
    if (wanted) this.#keepTextClear(scene);
    if (wanted && !this.#asked) this.#read(scene);
  }

  #keepTextClear(scene: Scene): void {
    const clearing = new AbortController();
    this.#clearing = clearing;
    const measure = () => {
      const box = document.querySelector("[data-clear]")?.getBoundingClientRect();
      if (box !== undefined) scene.keepClear({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
    };
    window.addEventListener("resize", measure, { signal: clearing.signal });
    measure();
  }

  #read(scene: Scene): void {
    this.#asked = true;
    readWorlds(import.meta.env.BASE_URL, { signal: this.#leaving.signal }).then(
      (file) => {
        if (file === undefined) return;
        this.#worlds = file.worlds;
        if (this.#shown) scene.cosmos(this.#worlds);
      },
      () => undefined,
    );
  }

  /** The page's scene has gone for good. */
  leave(): void {
    this.#leaving.abort();
    this.#clearing?.abort();
  }
}
