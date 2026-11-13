// A page's hold on space (D401): the place it shows (the home's view, a system or the universe by its address, the Earth, a world),
// kept while it is on screen; its planet's circle watched as the page lays it out; its text entering at once when no flight brings
// it, and its chrome ghosted out as it leaves. True once the first frame is drawn, or 2.5 s after the page is on screen.
import { EARTH } from "@gnoworld/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { HOME_SYSTEM, isHome } from "../../cosmosAt.ts";
import { asksFull } from "../../fullChat.ts";
import type { Place } from "../../space/place.ts";
import { warmView } from "../../plateWarm.ts";
import { useHere } from "../../useHere.ts";
import { enterPage, newPage } from "./arrival.ts";
import { ghost } from "./rise.ts";
import { drawnYet, flying, hold, onDrawn, release, show, syncFlown } from "./space.ts";

/** A world a page shows, by its id. */
export interface WorldShown {
  readonly world: string;
  readonly name?: string;
}

const FIRST_SCREEN_MS = 2_500;
// What a page that left for the full chat leaves as its kind: the page that comes back after it is no page of its kind.
const FULL_PAGE = "full";

// The kind of page standing now, the one that left as it came, and the one it came after: a cosmos view replacing a cosmos view (the
// galaxy at /universe, the Earth's ecosystem at /, a system) shows the same chrome where it was, so it leaves no ghost and rises nothing.
const pages: { standing?: string | undefined; left?: string | undefined; cameAfter?: string | undefined } = {};

/** Whether the page standing came after a page of its own kind (the cosmos after the cosmos): its chrome stays as it was (Alexis,
 * 2026-11-09: "ne pas recharger ce titre sur l'écosystème de la Terre qui a le même"). */
export const sameKind = (): boolean => pages.standing !== undefined && pages.standing === pages.cameAfter;

const kindOf = (body: "earth" | "cosmos" | WorldShown | undefined): string =>
  typeof body === "object" ? "world" : (body ?? "none");
// A page with no planet's box (the home) is looked at for five seconds, then left.
const LOOK_MS = 5000;

// The cosmos's place is its address's: `/universe`, `/s/<namespace>` (the router's `system`, decoded), or the home's view; as a kind and an
// id, two strings React compares as they are.
function placeOf(
  body: "earth" | "cosmos" | WorldShown | undefined,
  path: string,
  system: string | undefined,
): readonly [Place["kind"] | "none", string] {
  if (body === undefined) return ["none", ""];
  if (body === "earth") return ["world", EARTH];
  if (typeof body === "object") return ["world", body.world];
  if (path.endsWith("/universe")) return ["universe", ""];
  // The home's own path is the Earth's first screen; a namespace that orbits the Earth is the Earth's system, `/s/gnoland` (D501).
  if (system === undefined) return ["home", ""];
  return ["system", isHome(system) ? HOME_SYSTEM : system];
}

const placeFrom = (kind: Place["kind"] | "none", id: string): Place | undefined => {
  if (kind === "none") return undefined;
  return kind === "world" || kind === "system" ? { kind, id } : { kind };
};

/** Shows space at the page's place (`body`: the Earth, the cosmos or a world) while the page is on screen. */
export function useSpace(body?: "earth" | "cosmos" | WorldShown): boolean {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The page's one reading of who is here, held while space shows: every world's name carries it (D562).
  useHere(true);
  const [kind, id] = placeOf(body, pathname, useParams()["system"]);
  // A page that comes once space drew finds it drawn: its chat and its loader know it from the first render.
  const [firstScreenDone, setFirstScreenDone] = useState(drawnYet);
  // Whether this page stands: a strict second run (development) or the same page asked again keeps it, and it leaves no ghost.
  const standingRef = useRef(false);
  // Before the page paints: a flight this page asks hides its plate in the same frame, so it never shows for one.
  const pageKind = kindOf(body);
  useLayoutEffect(() => {
    standingRef.current = true;
    pages.cameAfter = pages.left ?? pages.standing;
    pages.standing = pageKind;
    pages.left = undefined;
    newPage(`${pageKind}:${kind}:${id}`);
    show(placeFrom(kind, id), (href) => {
      Promise.resolve(navigate(href)).catch(reportError);
    });
    // A world's page (the Earth's, a world's, a realm's) has a plate, which may come after this: its arrival waits for it.
    // The page the full chat gave back stands again with its plate coming in and its dock where it was: the chat holds its own (fullMove.ts).
    if (!flying()) enterPage(pages.cameAfter === FULL_PAGE, sameKind());
    // The planet's circle as the page lays its box out (a page's parts come late: the page's changes are watched till it comes), and as it moves.
    const watching = new ResizeObserver(hold);
    const coming = new MutationObserver(() => {
      if (document.querySelector("[data-globe]") !== null) look();
    });
    let frame = 0;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      const box = document.querySelector("[data-globe]");
      if (box !== null) {
        coming.disconnect();
        clearTimeout(giveUp);
        syncFlown();
        for (const part of [box, ...document.querySelectorAll("[data-look='plate'], [data-dock]")])
          watching.observe(part);
      } else if (giveUp === undefined) {
        coming.observe(document.body, { childList: true, subtree: true });
        giveUp = setTimeout(() => {
          coming.disconnect();
        }, LOOK_MS);
      }
      hold();
    };
    frame = requestAnimationFrame(look);
    addEventListener("resize", hold);
    return () => {
      cancelAnimationFrame(frame);
      coming.disconnect();
      clearTimeout(giveUp);
      watching.disconnect();
      removeEventListener("resize", hold);
      standingRef.current = false;
      pages.left = asksFull(new URLSearchParams(location.search)) ? FULL_PAGE : pageKind;
      pages.standing = undefined;
      release();
      // No ghost where the page that follows is of this one's kind: its chrome stands where this one's stood.
      ghost(() => standingRef.current || pages.standing === pageKind);
    };
  }, [kind, id, navigate, pageKind]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFirstScreenDone(true);
    }, FIRST_SCREEN_MS);
    const stop = onDrawn(() => {
      setFirstScreenDone(true);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);
  // The plate's code and the worlds in view's files, asked ahead once the first screen stands, and the links' intent (plateWarm.ts).
  useEffect(() => (firstScreenDone ? warmView({ kind, id }) : undefined), [firstScreenDone, kind, id]);
  return firstScreenDone;
}
