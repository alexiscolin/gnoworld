// Pages render only at build time (ssr: false), so each renders whole, and an error fails the
// build. It replaces React Router's default, which wants `isbot` and installs it during a build.
import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";

export default async function handleRequest(request: Request, status: number, headers: Headers, context: EntryContext) {
  let failure: unknown;
  const body = await renderToReadableStream(<ServerRouter context={context} url={request.url} />, {
    onError(error: unknown) {
      failure ??= error;
    },
  });
  await body.allReady;
  if (failure !== undefined) throw new Error(`pre-rendering ${request.url} failed`, { cause: failure });
  headers.set("Content-Type", "text/html");
  return new Response(body, { headers, status });
}
