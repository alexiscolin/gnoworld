import { Button } from "@gnoworld/ui";
import { expect, test } from "vitest";
import { render } from "../tests/render.tsx";
import { Shell } from "./shell.tsx";

// F326, in the shell the pages sit in: Layout wears it, so a link to a file of the site is a plain anchor there, and a page's
// link goes through the router. Without this, AppLinks could be right alone and the site still send /sitemap.xml to "No page here".
test("the shell's links: a file of the site is a plain anchor, a page goes through the router", async () => {
  const html = await render(
    {
      path: "/",
      Component: () => (
        <Shell>
          <Button href="/sitemap.xml">Sitemap</Button>
          <Button href="/list">Places</Button>
        </Shell>
      ),
    },
    "/",
  );
  const anchor = (href: string) => new RegExp(`<a [^>]*href="${href}"[^>]*>`).exec(html)?.[0] ?? "";
  expect(anchor("/sitemap.xml")).not.toBe("");
  expect(anchor("/sitemap.xml")).not.toContain("data-discover");
  expect(anchor("/list")).toContain('data-discover="true"');
});
