// How the reader looks at space, and where the scene's eye rests (part 7v; Alexis, 2026-11-03): Dynamic, space as it is, or the Plan, seen
// from above with its orbits drawn, the same at every scale, as the header's two icons and V set it; and the system the eye rests at, as the
// scene says, for the crumb back and the hero. No React state and no store's shape: the components read it as the universe reads the host.
import { useSyncExternalStore } from "react";
import { Heard } from "../../lib/heard.ts";

export type Seeing = "dynamic" | "plan";

class Views {
  #seeing: Seeing = "dynamic";
  #system: string | undefined;
  #worlds = 0;
  readonly #heard = new Heard();
  readonly subscribe = this.#heard.subscribe;

  /** How the reader looks: Dynamic by default. */
  readonly seeing = (): Seeing => this.#seeing;

  /** The system the scene's eye rests at, by its id; none at rest. */
  readonly system = (): string | undefined => this.#system;

  /** How many worlds the system the eye rests at holds; none at rest. */
  readonly worlds = (): number => this.#worlds;

  see(seeing: Seeing): void {
    if (seeing === this.#seeing) return;
    this.#seeing = seeing;
    this.#heard.tell();
  }

  toggle(): void {
    this.see(this.#seeing === "plan" ? "dynamic" : "plan");
  }

  readonly rest = (system: string | undefined, worlds = 0): void => {
    if (system === this.#system && worlds === this.#worlds) return;
    this.#system = system;
    this.#worlds = worlds;
    this.#heard.tell();
  };
}

/** The page's one record of them. */
export const views = new Views();

/** Tells `scene` the reader's view, at once where it is the Plan, then at each change; what it returns stops the telling, the scene gone,
 * and no system rests then. */
export function tellScene(scene: { see(plan: boolean): void }): () => void {
  let told = false;
  const tell = () => {
    const plan = views.seeing() === "plan";
    if (plan === told) return;
    told = plan;
    scene.see(plan);
  };
  tell();
  const stop = views.subscribe(tell);
  return () => {
    stop();
    views.rest(undefined);
  };
}

/** What the scene says of where its eye rests, told to the page with how many worlds `count` gives that system (7v's card). */
export const restsAt =
  (count: (system: string) => number) =>
  (system: string | undefined): void => {
    views.rest(system, system === undefined ? 0 : count(system));
  };

const seenFirst = (): Seeing => "dynamic";
const nowhere = () => undefined;

/** How the reader looks, for a component. */
export const useSeeing = (): Seeing => useSyncExternalStore(views.subscribe, views.seeing, seenFirst);

/** The system the eye rests at, for a component; none on the server's page. */
export const useResting = (): string | undefined => useSyncExternalStore(views.subscribe, views.system, nowhere);

const none = () => 0;

/** How many worlds the system the eye rests at holds, for a component. */
export const useRestingWorlds = (): number => useSyncExternalStore(views.subscribe, views.worlds, none);
