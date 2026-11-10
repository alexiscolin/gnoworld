// Pages render only at build time (ssr: false), so each renders whole, and an error fails the
// build. It replaces React Router's default, which wants `isbot` and installs it during a build.
// A page with the cosmos, the Earth or a world also names its first maps to preload (preloads.ts).
import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { pagePreloads, withPreloads } from "./preloads.ts";

export default async function handleRequest(request: Request, status: number, headers: Headers, context: EntryContext) {
  let failure: unknown;
  const body = await renderToReadableStream(<ServerRouter context={context} url={request.url} />, {
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
  const { matches, loaderData } = context.staticHandlerContext;
  const page = matches.at(-1)?.route.id ?? "";
  return new Response(withPreloads(await new Response(body).text(), pagePreloads(page, loaderData[page])), {
    headers,
    status,
  });
}
