// A page hydrated from the file the build wrote: Vitest's jsdom draws `tree` on the server at `written`, then hydrates that markup at
// `opened`, and returns the host and what React reported as a mismatch (an empty list: none).
import { act, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter, StaticRouter } from "react-router";

export function hydrateAt(tree: ReactNode, written: string, opened: string): { host: HTMLElement; errors: string[] } {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const html = renderToString(<StaticRouter location={written}>{tree}</StaticRouter>);
  const host = document.createElement("div");
  host.replaceChildren(...new DOMParser().parseFromString(html, "text/html").body.childNodes);
  document.body.append(host);
  const errors: string[] = [];
  act(() => {
    hydrateRoot(host, <MemoryRouter initialEntries={[opened]}>{tree}</MemoryRouter>, {
      onRecoverableError: (error) => errors.push(String(error).slice(0, 300)),
    });
  });
  return { host, errors };
}
