// "Go explore" (ADR-0003 §3; frame 4's filled call): its address is the Earth's, which a new tab opens; a plain click asks where to go (the
// live moment, else today's next stop: explore.ts; while a tag is lit, its worlds in turn) and goes there through the router, so 7g's flight
// takes the page from the cosmos to that world. A click with a key held, or with another button, is the browser's.
import { Icon } from "@gnoworld/ui";
import { useEffect, useRef, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import { followed } from "../../lib/followed.ts";
import { reportedOr } from "../../lib/reported.ts";
import { raisePill } from "../../topPill.tsx";
import type { ExplorePlaces } from "./explore.ts";
import { useLens, useLit } from "../../lenses.ts";
import { data } from "../../railFeed.ts";
import { keptRail } from "../../railWorlds.ts";

// The search, a chunk of its own asked at the click (a dynamic import inside a component fails the React Compiler's build).
const busiest = (places: ExplorePlaces) => import("./explore.ts").then(({ exploreTo }) => exploreTo(places));

/** What "Go explore" does: asks where to go and goes there; a second ask waits for the first, and a page that left goes nowhere. */
export function useExplore(places: ExplorePlaces): () => void {
  const navigate = useNavigate();
  // The click under way, if one is.
  const askingRef = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => {
      askingRef.current?.abort();
    },
    [],
  );
  return () => {
    if (askingRef.current !== undefined) return;
    const asked = new AbortController();
    askingRef.current = asked;
    // The pill's Passport opens over the page the flight goes to, by its own address: this hero is gone by then.
    const passportAt = (path: string) => {
      Promise.resolve(navigate({ pathname: path, hash: "passport" }, { preventScrollReset: true })).catch(reportError);
    };
    reportedOr(busiest({ ...places, passportAt, raise: raisePill }), places.earth)
      .then((href) => {
        askingRef.current = undefined;
        if (!asked.signal.aborted) return navigate(href);
      })
      .catch(reportError);
  };
}

// The worlds a tag lights, in the rail's order (D425): Go explore flies to each in turn, from the liveliest.
let turn = { lens: "", next: 0 };
function nextLit(lens: string, entries: readonly { readonly href: string }[]): string | undefined {
  if (turn.lens !== lens) turn = { lens, next: 0 };
  const entry = entries[turn.next % Math.max(entries.length, 1)];
  turn = { lens, next: turn.next + 1 };
  return entry?.href;
}

export function GoExplore({ places, className }: { places: ExplorePlaces; className: string | undefined }) {
  const explore = useExplore(places);
  const navigate = useNavigate();
  const lens = useLens();
  const lit = useLit();
  const go = (event: MouseEvent) => {
    const only = lens === undefined ? undefined : lit?.sets.get(lens);
    const known = data();
    const next =
      only === undefined || known === undefined
        ? undefined
        : nextLit(
            lens ?? "",
            keptRail(known, places, (id) => only.has(id)),
          );
    if (next === undefined) followed(event, places.earth, explore);
    else
      followed(event, next, (href) => {
        Promise.resolve(navigate(href)).catch(reportError);
      });
  };
  return (
    <Link to={places.earth} className={className} data-emphasis="solid" onClick={go}>
      Go explore
      <Icon name="arrow" />
    </Link>
  );
}
