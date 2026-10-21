// A world's page: pre-rendered for each known world; any other name gets this route's not-found.
import {
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
  type MetaArgs,
} from "react-router";
import { failedWorldMeta, worldMeta } from "../meta.ts";
import { findWorld } from "../worlds.ts";
import { PageError } from "../features/errors/index.ts";

export function loader({ params }: LoaderFunctionArgs) {
  return findWorld(params["world"]);
}

// The list ships with the client, so the browser fetches no world: an unknown name is a 404
// here, not a request the static host answers with its fallback page.
export function clientLoader({ params }: ClientLoaderFunctionArgs) {
  return findWorld(params["world"]);
}

export function meta({ loaderData, error }: MetaArgs<typeof loader>) {
  return loaderData || isMissing(error) ? worldMeta(loaderData) : failedWorldMeta();
}

function isMissing(error: unknown): boolean {
  return isRouteErrorResponse(error) && error.status === 404;
}

export default function World() {
  const world = useLoaderData<typeof loader>();
  return (
    <>
      <h1>{world.name}</h1>
      <p>{world.description}</p>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const missing = isMissing(error);
  return missing ? (
    <PageError title="No world here" line="No world of gno.land goes by that name." />
  ) : (
    <PageError title="This world could not load" line="Try again in a moment." reload />
  );
}
