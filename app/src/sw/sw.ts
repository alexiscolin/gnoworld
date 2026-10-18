// The worker the build ships as /sw.js: app/vite.config.ts writes the two values below into it.
import { listen, type WorkerScope } from "./worker.ts";

declare const __GNOWORLD_PRECACHE__: readonly string[];
declare const __GNOWORLD_VERSION__: string;

listen(self as unknown as WorkerScope, __GNOWORLD_PRECACHE__, __GNOWORLD_VERSION__);
