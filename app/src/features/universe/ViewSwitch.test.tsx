// @vitest-environment jsdom
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { all, mount, one } from "../../../tests/mount.tsx";
import { OPEN } from "../../scene/openEvent.ts";
import { views } from "./views.ts";
import { ViewSwitch } from "./ViewSwitch.tsx";

// The views of space (7v; Alexis, 2026-11-03, the GUI board's option B): two icons in the header's views pill, after Earth, Cosmos and List,
// for how one looks (Dynamic, Plan), each naming itself on hover and to a screen reader; V toggles them. The Plan's second click on a
// world's name comes to the page as an event, which its router follows.
const switched = () => {
  const router = createMemoryRouter(
    [
      { path: "/", element: <ViewSwitch /> },
      { path: "*", element: <p data-at="" /> },
    ],
    { initialEntries: ["/"] },
  );
  return { box: mount(<RouterProvider router={router} />), router };
};
const pressed = (box: HTMLElement) =>
  all(box, "button[aria-pressed]").map((button) => [
    button.getAttribute("aria-label"),
    button.getAttribute("aria-pressed"),
  ]);
const key = (init: KeyboardEventInit, target: EventTarget = document.body) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
  });
};

afterEach(() => {
  views.see("dynamic");
  views.rest(undefined);
});

describe("the views of space", () => {
  it("offers two views, named for a reader, in a group of their own, the dynamic one pressed", () => {
    const { box } = switched();
    expect(one(box, "[role='group']").getAttribute("aria-label")).toBe("Views of space");
    expect(pressed(box)).toEqual([
      ["Dynamic view", "true"],
      ["Plan view", "false"],
    ]);
  });

  it("presses the Plan at a click, and back, and tells whoever listens", () => {
    const { box } = switched();
    const told: string[] = [];
    const stop = views.subscribe(() => told.push(views.seeing()));
    act(() => {
      one(box, "button[aria-label='Plan view']").click();
    });
    expect(pressed(box)).toEqual([
      ["Dynamic view", "false"],
      ["Plan view", "true"],
    ]);
    act(() => {
      one(box, "button[aria-label='Dynamic view']").click();
    });
    expect(told).toEqual(["plan", "dynamic"]);
    stop();
  });

  it("toggles at V, upper or lower case, but not in a field, a dialog, or with a modifier", () => {
    const { box } = switched();
    key({ key: "v" });
    expect(views.seeing()).toBe("plan");
    key({ key: "V" });
    expect(views.seeing()).toBe("dynamic");
    for (const init of [
      { key: "v", metaKey: true },
      { key: "v", ctrlKey: true },
      { key: "v", altKey: true },
    ])
      key(init);
    expect(views.seeing()).toBe("dynamic");
    for (const tag of ["input", "textarea", "select", "div"]) {
      const field = document.createElement(tag);
      if (tag === "div") field.setAttribute("contenteditable", "true");
      document.body.append(field);
      key({ key: "v" }, field);
      field.remove();
    }
    expect(views.seeing()).toBe("dynamic");
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    key({ key: "v" });
    expect(views.seeing()).toBe("dynamic");
    dialog.remove();
    expect(pressed(box)[0]?.[1]).toBe("true");
  });

  it("follows a world's address the Plan hands it through the page's router", async () => {
    const { box, router } = switched();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(OPEN, { detail: "/r/gnoswap/v1/router" }));
      await Promise.resolve();
    });
    expect(router.state.location.pathname).toBe("/r/gnoswap/v1/router");
    expect(all(box, "[data-at]")).toHaveLength(1);
  });

  it("follows nothing but the site's own paths", async () => {
    const { router } = switched();
    // A backslash and a tab are slashes and nothing to the address parser: both forms would leave the site.
    const hostile = [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "/\t/evil.example",
      "/%2F/evil.example",
    ];
    for (const detail of [...hostile, "javascript:alert(1)", "/sitemap.xml", 42])
      await act(async () => {
        window.dispatchEvent(new CustomEvent(OPEN, { detail }));
        await Promise.resolve();
      });
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("where the eye rests", () => {
  it("tells whoever listens the system the eye rests at, and none once back", () => {
    const told: (string | undefined)[] = [];
    const stop = views.subscribe(() => told.push(views.system()));
    views.rest("gnoswap");
    views.rest("gnoswap");
    views.rest(undefined);
    expect(told).toEqual(["gnoswap", undefined]);
    stop();
  });
});
