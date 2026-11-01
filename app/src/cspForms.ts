// The inline scripts React Router writes in a page, which the CSP allows by their hash (csp.ts): the forms a script's text
// may take, and no other. Split from csp.ts to keep each file small; nothing else changed.
// The inline scripts React Router 8.4.0 writes in a page, and no other (F475): a script planted in a page fails the build
// instead of being allowed by its hash. Copied from a build (cspFixture.ts); an upgrade that changes one stops the build until
// it is read again. What varies (a JSON, a string, a file name) is checked as data.
const SCROLL_RESTORATION =
  '((storageKey, restoreKey) => {\n\t\tif (!window.history.state || !window.history.state.key) {\n\t\t\tlet key = Math.random().toString(32).slice(2);\n\t\t\twindow.history.replaceState({ key }, "");\n\t\t}\n\t\ttry {\n\t\t\tlet storedY = JSON.parse(sessionStorage.getItem(storageKey) || "{}")[restoreKey || window.history.state.key];\n\t\t\tif (typeof storedY === "number") window.scrollTo(0, storedY);\n\t\t} catch (error) {\n\t\t\tconsole.error(error);\n\t\t\tsessionStorage.removeItem(storageKey);\n\t\t}\n\t})("react-router-scroll-positions", null)';
const STREAM_CLOSE = "window.__reactRouterContext.streamController.close();";
const CONTEXT_HEAD = "window.__reactRouterContext = ";
const CONTEXT_TAIL =
  ";window.__reactRouterContext.stream = new ReadableStream({start(controller){window.__reactRouterContext.streamController = controller;}}).pipeThrough(new TextEncoderStream());";
const ENQUEUE_HEAD = "window.__reactRouterContext.streamController.enqueue(";

// The module script: imports of the build's assets, the routes' table, the entry's import.
function isModuleScript(text: string): boolean {
  // A file of the build's assets, by its name alone: no slash, so no path leaves /assets/.
  const asset = /"\/assets\/[\w.-]+\.js"/.source;
  return new RegExp(
    String.raw`^(?:import ${asset};\n|import \* as route\d+(?:_\w+)? from ${asset};\n|const route\d+ = \{\.\.\.route\d+_\w+(?:,\.\.\.route\d+_\w+)*\};\n)+` +
      String.raw`\s*window\.__reactRouterRouteModules = \{"[\w/.$-]+":route\d+(?:,"[\w/.$-]+":route\d+)*\};\n\nimport\(${asset}\);$`,
  ).test(text);
}

function isJson(text: string, kind: "object" | "string"): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return kind === "string" ? typeof value === "string" : typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}

// The loader data: a JSON text in a string literal (JSON.parse takes no raw line break, no code joined to it), handed to the stream.
function isLoaderData(text: string): boolean {
  if (!text.startsWith(ENQUEUE_HEAD) || !text.endsWith(");")) return false;
  const literal = text.slice(ENQUEUE_HEAD.length, -2);
  return isJson(literal, "string");
}

// Which of React Router's forms a script's text is, as its place in the order a page holds them (scroll restoration, context,
// module script, loader data, close), or -1 when it is none of them.
export function formOf(text: string): number {
  if (text === SCROLL_RESTORATION) return 0;
  if (text === STREAM_CLOSE) return 4;
  if (isModuleScript(text)) return 2;
  if (text.startsWith(CONTEXT_HEAD) && text.endsWith(CONTEXT_TAIL))
    return isJson(text.slice(CONTEXT_HEAD.length, -CONTEXT_TAIL.length), "object") ? 1 : -1;
  return isLoaderData(text) ? 3 : -1;
}
