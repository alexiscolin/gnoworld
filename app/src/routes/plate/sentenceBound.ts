import { useEffect, useState } from "react";
import type { Realm } from "../../features/realms/useRealm.ts";
import type { PlateModel } from "./model.ts";
import { sentenceOf } from "./sentence.ts";

// How long the plate waits for the realm's sentence before it comes without it (D13971: a move may last a little longer to land whole).
const SENTENCE_MS = 1200;
/** Whether the plate has waited long enough for its sentence. */
export function useSentenceBound(): boolean {
  const [passed, setPassed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setPassed(true);
    }, SENTENCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return passed;
}

/** The lede's sentence of a page that was read whole; none while it comes (`pending`, its room kept) or when it failed. */
export const ledeSentence = (state: Realm): Pick<PlateModel["lede"], "sentence" | "pending"> => ({
  sentence: state.state === "read" && state.page.kind === "page" ? sentenceOf(state.page.blocks) : undefined,
  pending: state.state === "loading",
});
