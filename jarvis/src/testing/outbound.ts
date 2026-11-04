// Loaded by an entry's test with `node --import`, before jarvis: each request to an origin JARVIS_TEST_OUTBOUND names
// (Anthropic's API, gnoscope, a universe's node) goes to the test's own fake for it instead, over plain HTTP on the
// loopback, every other request as it was. Jarvis's own code runs unchanged, its SDK and its clients included: only the
// network is faked. Never in an image (the test helpers stay out of it); jarvis's code never reads this setting.
import { z } from "zod";

const routes = z.record(z.string(), z.string()).parse(JSON.parse(process.env["JARVIS_TEST_OUTBOUND"] ?? "{}"));
const real = globalThis.fetch;
globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const to = Object.hasOwn(routes, url.origin) ? routes[url.origin] : undefined;
  if (to === undefined) return real(input, init);
  const moved = `${to}${url.pathname}${url.search}`;
  return input instanceof Request ? real(new Request(moved, input), init) : real(moved, init);
};
