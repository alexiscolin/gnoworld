// Pages render only at build time (ssr: false), so each renders whole, and an error fails the
// build. It replaces React Router's default, which wants `isbot` and installs it during a build.
// A page with the cosmos, the Earth or a world also names its first maps to preload (preloads.ts).
import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { documentPreloads, withPreloads } from "./preloads.ts";

// A part that never settles fails the build at this deadline rather than holding it for good.
const RENDER_MS = 30_000;

export default async function handleRequest(request: Request, status: number, headers: Headers, context: EntryContext) {
  let failure: unknown;
  const body = await renderToReadableStream(<ServerRouter context={context} url={request.url} />, {
    signal: AbortSignal.timeout(RENDER_MS),
    // Every part in its place, however long: React moves a part past its 12,800 characters out with an inline script of its own, which
    // the policy refuses (csp.ts), as GovDAO's proposals grew to.
    progressiveChunkSize: Number.POSITIVE_INFINITY,
    onError(error: unknown) {
      failure ??= error;
    },
  });
  await body.allReady;
  if (failure !== undefined) throw new Error(`pre-rendering ${request.url} failed`, { cause: failure });
  headers.set("Content-Type", "text/html");
  return new Response(withPreloads(await new Response(body).text(), documentPreloads(context)), {
    headers,
    status,
  });
}
