// A route drawn in the DOM at a path, inside the page's store, through React Router's memory router: for the tests that watch a page
// after it has run (its stream, its store), where render.tsx draws it once as the build does.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from "react-router";
import { afterEach, expect, vi } from "vitest";
import "./queries.ts";
import { fakeStream } from "./fakeStream.ts";
import { DockedChatHost } from "../src/features/chat/index.ts";
import { StoreProvider } from "../src/storeContext.tsx";

const leaving: (() => void)[] = [];
afterEach(() => {
  for (const leave of leaving.splice(0)) leave();
});

/** The route at `path`, drawn; `leave` unmounts it (it is unmounted after each test if the test did not). */
export function drawRoute(route: RouteObject, path: string) {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no popover API (the header's tooltips ask for it) and no reportError (a late read that fails sends it there).
  Object.assign(HTMLElement.prototype, { togglePopover: () => true });
  vi.stubGlobal("reportError", vi.fn());
  const box = document.createElement("div");
  document.body.append(box);
  const root = createRoot(box);
  let drawn = true;
  const leave = () => {
    if (!drawn) return;
    drawn = false;
    act(() => {
      root.unmount();
    });
    box.remove();
  };
  leaving.push(leave);
  // The shell's one docked chat (shell.tsx) stands over the route, as it does in the page.
  const shell = {
    element: (
      <>
        <DockedChatHost />
        <Outlet />
      </>
    ),
    children: [route],
  };
  const router = createMemoryRouter([shell], { initialEntries: [path] });
  act(() => {
    root.render(
      <StoreProvider>
        <RouterProvider router={router} />
      </StoreProvider>,
    );
  });
  return { box, leave };
}

/** The page follows one stream once it has run, and closes it when it is left. */
export async function expectStreamClosedOnLeave(route: RouteObject, path: string): Promise<void> {
  const sources = fakeStream();
  const { leave } = drawRoute(route, path);
  await vi.waitFor(() => {
    expect(sources.opened).toHaveLength(1);
  });
  expect(sources.opened[0]?.closed).toBe(0);
  leave();
  expect(sources.opened[0]?.closed).toBe(1);
}
