// The worker the build ships as /sw.js: app/vite.config.ts writes the list below into it.
import { precache, takeOver, type WorkerScope } from "./worker.ts";

declare const __GNOWORLD_PRECACHE__: readonly string[];

const scope = self as unknown as WorkerScope;
precache(scope, __GNOWORLD_PRECACHE__);
takeOver(scope);
