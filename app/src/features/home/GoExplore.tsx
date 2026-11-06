// "Go explore" (ADR-0003 §3; frame 4's filled call): its address is the Earth's, which a new tab opens; a plain click asks where to go (the
// live moment, else today's next stop: explore.ts) and goes there through the router, so 7g's flight takes the page from the cosmos to that
// world. A click with a key held, or with another button, is the browser's.
import { Icon } from "@gnoworld/ui";
import { useEffect, useRef, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import { followed } from "../../lib/followed.ts";
import { raisePill } from "../../topPill.tsx";
import type { ExplorePlaces } from "./explore.ts";

// The search, a chunk of its own asked at the click (a dynamic import inside a component fails the React Compiler's build).
const busiest = (places: ExplorePlaces) => import("./explore.ts").then(({ exploreTo }) => exploreTo(places));

export function GoExplore({ places, className }: { places: ExplorePlaces; className: string | undefined }) {
  const navigate = useNavigate();
  // The click under way, if one is: a second waits for it, and a page that left goes nowhere.
  const askingRef = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => {
      askingRef.current?.abort();
    },
    [],
  );
  const explore = () => {
    if (askingRef.current !== undefined) return;
    const asked = new AbortController();
    askingRef.current = asked;
    // The pill's Passport opens over the page the flight goes to, by its own address: this hero is gone by then.
    const passportAt = (path: string) => {
      Promise.resolve(navigate({ pathname: path, hash: "passport" }, { preventScrollReset: true })).catch(reportError);
    };
    busiest({ ...places, passportAt, raise: raisePill })
      .catch(() => places.earth)
      .then((href) => {
        askingRef.current = undefined;
        if (!asked.signal.aborted) return navigate(href);
      })
      .catch(reportError);
  };
  const go = (event: MouseEvent) => {
    followed(event, places.earth, explore);
  };
  return (
    <Link to={places.earth} className={className} data-emphasis="solid" onClick={go}>
      Go explore
      <Icon name="arrow" />
    </Link>
  );
}
