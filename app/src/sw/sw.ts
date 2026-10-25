// The worker the build ships as /sw.js: app/vite.config.ts defines the list below.
import { reportViolations } from "./report.ts";
import { precache, release, takeOver, type Precached, type WorkerScope } from "./worker.ts";

declare const __GNOWORLD_PRECACHE__: readonly Precached[];

const scope = self as unknown as WorkerScope & Parameters<typeof reportViolations>[0];
reportViolations(scope, reportError);
precache(scope, __GNOWORLD_PRECACHE__);
takeOver(scope);
release(scope);
