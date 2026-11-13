import { useSyncExternalStore } from "react";

/** The window where a place's chat has a dock beside the scene (ui's Panel.Layout) and the planet is framed close (D458). */
export const DOCKED = "(min-width: 1280px)";

/** Whether the screen matches a media query, read as the screen says it and again when it changes; a page rendered on
 * the server says no. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => {
        media.removeEventListener("change", onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
