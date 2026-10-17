// A world's page: pre-rendered for each known world; any other name gets this route's not-found.
import {
  data,
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
  type MetaArgs,
} from "react-router";
import { pageMeta, worldBySlug } from "../site.ts";

function load(slug: string | undefined) {
  const world = worldBySlug(slug);
  if (!world) throw data(null, { status: 404 });
  return world;
}

export function loader({ params }: LoaderFunctionArgs) {
  return load(params["world"]);
}

// The list ships with the client, so the browser fetches no world: an unknown name is a 404
// here, not a request the static host answers with its fallback page.
export function clientLoader({ params }: ClientLoaderFunctionArgs) {
  return load(params["world"]);
}

export function meta({ loaderData: world }: MetaArgs<typeof loader>) {
  if (!world) return [{ title: "No world here · gno.world" }, { name: "robots", content: "noindex" }];
  return pageMeta({ title: `${world.name} · gno.world`, description: world.description, path: `/w/${world.slug}` });
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
