// GET /api/jarvis/state (10u-a): whether Jarvis is on, for any page, with no session and no call to jarvis. A read with no side
// effect and the same for everyone, so it has no guard but the no-store header; the door's switch is its only input.
import type { JarvisState } from "@gnoworld/schemas";
import { Hono } from "hono";

export function stateRoutes({ on }: { on: boolean }): Hono {
  const app = new Hono();
  app.get("/state", (c) => {
    c.header("cache-control", "no-store");
    return c.json({ on } satisfies JarvisState);
  });
  return app;
}
