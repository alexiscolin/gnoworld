// A part of the universe's page in a chunk of its own, asked as it first draws (the Earth's signs, a world's moons, the cosmos's rail): a
// chunk that does not come draws nothing, and the canvas and the rest stand. The universe's root has no error boundary of its own.
import { lazy, type ComponentType } from "react";

/** The part `load` brings, or nothing where its chunk does not come. */
export const lazyPart = <Props extends object>(load: () => Promise<ComponentType<Props>>) =>
  lazy<ComponentType<Props>>(() =>
    load().then(
      (part) => ({ default: part }),
      () => ({ default: () => null }),
    ),
  );
