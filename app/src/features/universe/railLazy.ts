// The rail of worlds, in its own chunk asked once space shows (the first screen holds none of it), kept by one module: the home's route
// and the cosmos's, each its own copy of routes/home.tsx once the router splits its route modules, share it, so a page of the cosmos
// replacing another never waits for it again (sameKind).
import { lazy } from "react";

export const LazyRail = lazy(async () => ({ default: (await import("./Rail.tsx")).Rail }));
