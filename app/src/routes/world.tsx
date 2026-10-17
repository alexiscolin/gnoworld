// A world's page: pre-rendered for each known world; any other name gets this route's not-found.
import {
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
  type MetaArgs,
} from "react-router";
import { findWorld, worldMeta } from "../site.ts";

export function loader({ params }: LoaderFunctionArgs) {
  return findWorld(params["world"]);
}

// The list ships with the client, so the browser fetches no world: an unknown name is a 404
// here, not a request the static host answers with its fallback page.
export function clientLoader({ params }: ClientLoaderFunctionArgs) {
  return findWorld(params["world"]);
}

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  return worldMeta(loaderData);
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
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div role="alert">
      <h1>{missing ? "No world here" : "This world could not load"}</h1>
      <p>{missing ? "No world of gno.land goes by that name." : "Try again in a moment."}</p>
    </div>
  );
}
