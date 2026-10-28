// The composer's lazy chunk, apart from Writer.tsx so that what only renews it (a thread panel's failure) does not
// load the Writer: an account's alone, a visitor's page never asks for its code (the first screen's budget, ADR-0001 §12).
import { lazy } from "react";

const load = async () => ({ default: (await import("./Composer.tsx")).Composer });
/** The composer, as Writer draws it: a live binding, which `renewComposer` replaces. */
export let Composer = lazy(load);

/** A lazy component keeps its failure for good: the page that caught a chunk that could not be fetched makes it anew. */
export function renewComposer() {
  Composer = lazy(load);
}
