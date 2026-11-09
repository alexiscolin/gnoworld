// ⌘K, "/" and the header's search buttons, which open the search palette (D355) over the places the page holds; a full Plan's "+N" and the
// rail's second tab open it too, by an event (F5462). The palette is a chunk of its own, fetched once the page rests (D504) and kept
// after, so its first opening is at once; a new page closes it (a place chosen, Go explore).
import { IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router";
import type { UniverseView } from "../../places.ts";
import { SEARCH } from "../../space/openEvent.ts";
import { afterLoad } from "../../later.ts";
import { opensPalette, SEARCH_HASH } from "./chord.ts";

const loadDialog = () => import("./SearchDialog.tsx");
const SearchDialog = lazy(loadDialog);
// raw: the palette's chunk is fetched this long after the page rests, clear of the first screen and the dive
const FETCH_AFTER_MS = 4000;

/** A control that opens the palette, as the rail's See all does: beside the bell on a computer, `outline`; in the views' pill on a phone,
 * `plain` (shellHeader.tsx). */
export function SearchButton({ className, emphasis }: { className: string; emphasis: "outline" | "plain" }) {
  return (
    <span className={className}>
      <IconButton
        icon="search"
        label="Search"
        emphasis={emphasis}
        onClick={() => {
          window.dispatchEvent(new CustomEvent(SEARCH, { detail: "" }));
        }}
      />
    </span>
  );
}

export function SearchPalette({ universe }: { universe: UniverseView }) {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  // The words it opens on, none but a full Plan's ask: other words start the palette anew on them.
  const [start, setStart] = useState("");
  const { pathname, hash } = useLocation();
  const [at, setAt] = useState(pathname);
  if (at !== pathname) {
    setAt(pathname);
    // The address /list leads to asks it open.
    setOpen(hash === SEARCH_HASH);
    if (hash === SEARCH_HASH) setAsked(true);
  }
  const show = () => {
    setStart("");
    setAsked(true);
    setOpen(true);
  };
  useEffect(() => {
    const controller = new AbortController();
    afterLoad(
      () => {
        // A fetch that fails is asked again at the first opening, by lazy's own import.
        loadDialog().catch(reportError);
      },
      controller.signal,
      FETCH_AFTER_MS,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (!opensPalette(event)) return;
        // The browser's own use of the chord (Firefox's address bar) is left; a dialog already open keeps the screen.
        event.preventDefault();
        if (document.querySelector("dialog[open]") === null) show();
      },
      { signal: controller.signal },
    );
    window.addEventListener(
      SEARCH,
      (event) => {
        const { detail } = event as CustomEvent<unknown>;
        show();
        setStart(typeof detail === "string" ? detail : "");
      },
      { signal: controller.signal },
    );
    return () => {
      controller.abort();
    };
  }, []);
  return (
    <>
      {asked ? (
        <Suspense fallback={null}>
          <SearchDialog
            key={start}
            start={start}
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
