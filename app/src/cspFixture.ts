// The inline scripts React Router 8.4.0 writes in a pre-rendered page of this app, copied from a build (a world's page
// data cut short), to test the policy against the forms it must accept. An upgrade that changes one fails the build until the
// pinned form in csp.ts is read again (F475): that is the point.
export const SCROLL =
  '((storageKey, restoreKey) => {\n\t\tif (!window.history.state || !window.history.state.key) {\n\t\t\tlet key = Math.random().toString(32).slice(2);\n\t\t\twindow.history.replaceState({ key }, "");\n\t\t}\n\t\ttry {\n\t\t\tlet storedY = JSON.parse(sessionStorage.getItem(storageKey) || "{}")[restoreKey || window.history.state.key];\n\t\t\tif (typeof storedY === "number") window.scrollTo(0, storedY);\n\t\t} catch (error) {\n\t\t\tconsole.error(error);\n\t\t\tsessionStorage.removeItem(storageKey);\n\t\t}\n\t})("react-router-scroll-positions", null)';

export const CONTEXT =
  'window.__reactRouterContext = {"basename":"/","future":{"unstable_enableNodeReadableStream":false,"unstable_optimizeDeps":false},"routeDiscovery":{"mode":"initial"},"ssr":false,"isSpaMode":false};window.__reactRouterContext.stream = new ReadableStream({start(controller){window.__reactRouterContext.streamController = controller;}}).pipeThrough(new TextEncoderStream());';

/** The module script of a world's page: one import for each file of its routes. */
export const MODULE =
  'import "/assets/manifest-39974629.js";\nimport * as route0 from "/assets/root-zgfyqO25.js";\nimport * as route1_clientLoader from "/assets/world-client-loader-VABR7zAY.js";\nimport * as route1_main from "/assets/world-main-BYZ1hRSc.js";\nconst route1 = {...route1_clientLoader,...route1_main};\n  \n  window.__reactRouterRouteModules = {"root":route0,"routes/world":route1};\n\nimport("/assets/entry.client-wQ9IaGdc.js");';

/** The module script of another page (the list): other routes, the same form. */
export const MODULE_LIST = [
  'import "/assets/manifest-39974629.js";',
  'import * as route0 from "/assets/root-zgfyqO25.js";',
  'import * as route1 from "/assets/list-DkQ2x9aL.js";',
  "",
  '  window.__reactRouterRouteModules = {"root":route0,"routes/list":route1};',
  "",
  'import("/assets/entry.client-wQ9IaGdc.js");',
].join("\n");

/** The loader data of a page, a JSON text in a string literal (the quotes escaped). */
export const ENQUEUE =
  'window.__reactRouterContext.streamController.enqueue("[{\\"_1\\":2,\\"_3\\":-5,\\"_4\\":-5},\\"loaderData\\",{\\"_5\\":6},\\"actionData\\",\\"errors\\",\\"routes/world\\",{\\"_7\\":8,\\"_9\\":10,\\"_11\\":12,\\"_13\\":14,\\"_15\\":16,\\"_17\\":18,\\"_19\\":20},\\"slug\\",\\"bubble\\",\\"name\\",\\"Bubble\\",\\"description\\",\\"Bubble, a world of gno.land: the BUBBLE token, its governance, and the games played with it on chain.\\",\\"universe\\",\\"onyx\\",\\"testnet\\",true,\\"path\\",\\"/w/bubble\\",\\"canonical\\",\\"/net/onyx/w/bubble\\"]\\n");';

export const CLOSE = "window.__reactRouterContext.streamController.close();";

/** A page as React Router writes it: JSON-LD first, then the five scripts; the module script and the loader data differ from page to page. */
export function page(module: string = MODULE, enqueue: string = ENQUEUE, ld = '{"@type":"WebPage"}'): string {
  return [
    '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/></head><body>',
    `<script type="application/ld+json">${ld}</script>`,
    `<script>${SCROLL}</script>`,
    `<script>${CONTEXT}</script>`,
    `<script type="module" async="">${module}</script>`,
    `<script>${enqueue}</script>`,
    `<script>${CLOSE}</script>`,
    "</body></html>",
  ].join("");
}
