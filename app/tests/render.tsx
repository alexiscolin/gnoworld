// A route rendered as the build renders it, through React Router's own static rendering: Vitest
// runs the app's routes with no DOM.
import { LinkProvider, type PageLinkProps } from "@gnoworld/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider, type RouteObject } from "react-router";

async function query(route: RouteObject, path: string) {
  const handler = createStaticHandler([route]);
  const context = await handler.query(new Request(`https://gno.world${path}`));
  if (context instanceof Response) throw new Error(`${path} answered ${String(context.status)}, not a page`);
  return { handler, context };
}

// What the app's router draws for ui's link slot, here a stand-in that marks the links it draws.
const routed = (props: PageLinkProps) => <a data-routed="" {...props} />;

/** A route as the build renders it; inside ui's link slot when asked, its links through the router marked. */
export async function render(route: RouteObject, path: string, { slot = false } = {}): Promise<string> {
  const { handler, context } = await query(route, path);
  const page = <StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} />;
  return renderToStaticMarkup(slot ? <LinkProvider link={routed}>{page}</LinkProvider> : page);
}

/** The error a route's loader gave for a path, as React Router hands it to the route's meta. */
export async function routeError(route: RouteObject, path: string): Promise<unknown> {
  const { context } = await query(route, path);
  return Object.values(context.errors ?? {})[0];
}

/** The way home a page that failed offers: the primary link to the universe. */
export const BACK_HOME = /<a [^>]*href="\/"[^>]*>Back to the universe<\/a>/;

/** What the page's alert holds: the markup inside its first role="alert" div, nested divs included. */
export function alertOf(html: string): string {
  const opening = '<div role="alert">';
  const start = html.indexOf(opening);
  if (start === -1) return "";
  const from = start + opening.length;
  let depth = 1;
  for (const tag of html.slice(from).matchAll(/<\/?div\b/g)) {
    depth += tag[0] === "<div" ? 1 : -1;
    if (depth === 0) return html.slice(from, from + tag.index);
  }
  return "";
}
