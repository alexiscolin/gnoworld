// On a phone the open palette is a history entry (#search), so the system Back closes it instead of leaving the site. `push` adds the
// entry as the palette opens; `leave` takes it off as it closes: back over it when it is ours, in place when it came with the address
// or the palette closes for a place chosen (whose own navigation replaces the entry: `holding`). The address's query stays. A computer's palette touches no history.
import { PHONE_QUERY } from "@gnoworld/core";
import { useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { SEARCH_HASH } from "./chord.ts";

export function usePaletteHistory() {
  const { hash, search } = useLocation();
  const navigate = useNavigate();
  const pushedRef = useRef(false);
  const phone = () => window.matchMedia(PHONE_QUERY).matches;
  const run = (done: Promise<void> | void) => {
    Promise.resolve(done).catch(reportError);
  };
  return {
    /** Whether the open palette stands on its own #search entry, which a place chosen takes over. */
    holding: hash === SEARCH_HASH,
    push: () => {
      if (!phone() || hash === SEARCH_HASH) return;
      pushedRef.current = true;
      run(navigate({ search, hash: SEARCH_HASH }));
    },
    leave: (going: boolean) => {
      if (!phone() || hash !== SEARCH_HASH) return;
      const back = pushedRef.current && !going;
      pushedRef.current = false;
      if (going) return;
      run(back ? navigate(-1) : navigate({ search, hash: "" }, { replace: true }));
    },
  };
}
