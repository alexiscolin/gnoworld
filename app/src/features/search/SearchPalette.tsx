// ⌘K and the header's search button, which open the search drawer (frames 98 to 100) over the places the page holds. The drawer is a chunk
// of its own, asked at the first opening and kept after, so it closes as a dialog does; a new page closes it (a place chosen, Go explore).
import { IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router";
import type { UniverseView } from "../../places.ts";
import { opensPalette } from "./chord.ts";

const SearchDrawer = lazy(() => import("./SearchDrawer.tsx"));

export function SearchPalette({ universe }: { universe: UniverseView }) {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  const { pathname } = useLocation();
  const [at, setAt] = useState(pathname);
  if (at !== pathname) {
    setAt(pathname);
    setOpen(false);
  }
  const show = () => {
    setAsked(true);
    setOpen(true);
  };
  useEffect(() => {
    const controller = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        if (!opensPalette(event)) return;
        // The browser's own use of the chord (Firefox's address bar) is left; a dialog already open keeps the screen.
        event.preventDefault();
        if (document.querySelector("dialog[open]") === null) {
          setAsked(true);
          setOpen(true);
        }
      },
      { signal: controller.signal },
    );
    return () => {
      controller.abort();
    };
  }, []);
  return (
    <>
      <IconButton icon="search" label="Search" emphasis="plain" onClick={show} />
      {asked ? (
        <Suspense fallback={null}>
          <SearchDrawer
            universe={universe}
            open={open}
            onClose={() => {
              setOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
