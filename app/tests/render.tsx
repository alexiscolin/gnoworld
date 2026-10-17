// A route rendered as the build renders it, through React Router's own static rendering: Vitest
// runs the app's routes with no DOM.
import { renderToStaticMarkup } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider, type RouteObject } from "react-router";

export async function render(route: RouteObject, path: string): Promise<string> {
  const handler = createStaticHandler([route]);
  const context = await handler.query(new Request(`https://gno.world${path}`));
  if (context instanceof Response) throw new Error(`${path} answered ${String(context.status)}, not a page`);
  return renderToStaticMarkup(
    <StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} />,
  );
}
