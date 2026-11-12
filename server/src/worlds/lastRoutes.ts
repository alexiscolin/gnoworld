// The routes of a job's last answer, kept in memory: GET / answers it, public for a minute; a 404 while the job has made none.
import { Hono } from "hono";

export function lastRoutes(last: () => unknown): Hono {
  const routes = new Hono();
  routes.get("/", (c) => {
    const answer = last();
    if (answer === undefined) return c.json({ error: "not_found" }, 404);
    c.header("cache-control", "public, max-age=60");
    return c.json(answer);
  });
  return routes;
}
