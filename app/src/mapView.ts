// Space seen from above, the Map (D433): at every level the scene's own view from over its plane, the links of the world in view drawn.
// Kept in the address (?view=map, addressState.ts); the door to space hears it and the engine flies between the two framings.
import { addressState } from "./addressState.ts";

const view = addressState<"map">("view", (word) => (word === "map" ? "map" : undefined));

/** Shows space from above, or as it turns. */
export const showMap = (on: boolean): void => {
  view.set(on ? "map" : undefined);
};

/** Flips between the two, as V does. */
export const toggleMap = (): void => {
  showMap(view.get() !== "map");
};

/** Whether space is seen from above now. */
export const isMap = (): boolean => view.get() === "map";

/** Calls `heard` as the Map is shown or left; returns what stops it. */
export const onMap = (heard: () => void): (() => void) => view.subscribe(heard);

/** Whether space is seen from above now, for a component. */
export const useMapView = (): boolean => view.useValue() === "map";
