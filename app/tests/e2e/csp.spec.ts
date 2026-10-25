import { readFileSync } from "node:fs";
import { expect, hydrated, PAGES, test, type Page } from "./fixtures.ts";
import { GUARDED, SITE } from "./sites.ts";

// The policy's shape: the unit test pins its words, this the page's every answer (slice 3's plan, 3f).
const SHAPE = new RegExp(
  "^default-src 'none'; script-src 'self'( 'sha256-[A-Za-z0-9+/]{43}=')+; style-src 'self'; img-src 'self' data:; " +
    "font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; " +
    "form-action 'self'; frame-ancestors 'none'$",
);
const PASSWORD = `Basic ${btoa("team:a test password")}`;
const BUILD = new URL("../../build/", import.meta.url);

test.describe("the content security policy", () => {
  test("is one policy on every answer: each page, the fallback, files, a 400, a 401 and a 500", async ({ request }) => {
    const answers = [];
    for (const path of [...PAGES, "/nowhere", "/w/Bubble", "/sw.js", "/manifest.webmanifest", "/icon-192.png"]) {
      answers.push(await request.get(path));
    }
    // A path that is no URL, and the build's own _headers file, whose type no host serves.
    answers.push(await request.get("/%E0%A4%A"), await request.get("/_headers"));
    answers.push(await request.post("/nowhere"));
    answers.push(await request.get(`${GUARDED}/`));
    answers.push(await request.get(`${GUARDED}/`, { headers: { authorization: PASSWORD } }));
    expect(answers.map((answer) => answer.status()).toSorted()).toEqual(
      [200, 200, 200, 200, 200, 200, 400, 401, 404, 404, 404, 500].toSorted(),
    );
    const policies = new Set(answers.map((answer) => answer.headers()["content-security-policy"]));
    expect(policies.size).toBe(1);
    expect([...policies][0]).toMatch(SHAPE);
  });

  test("is the same in the three places a host reads it: _headers, nginx's include and the test host", async ({
    request,
  }) => {
    const served = (await request.get("/")).headers()["content-security-policy"];
    const headers = readFileSync(new URL("client/_headers", BUILD), "utf8");
    const nginx = readFileSync(new URL("csp.conf", BUILD), "utf8");
    expect(headers).toBe(`/*\n  Content-Security-Policy: ${String(served)}\n`);
    expect(nginx).toBe(`add_header Content-Security-Policy "${String(served)}" always;\n`);
  });

  test("names the hash of every inline script the built pages hold, as the browser parses them, and no other", async ({
    page,
    request,
  }) => {
    const served = String((await request.get("/")).headers()["content-security-policy"]);
    await page.goto("/");
    const hashes = new Set<string>();
    // The pre-rendered pages, and the fallback a path the build never made gets.
    for (const path of [...PAGES, "/nowhere"]) {
      const html = await (await request.get(path)).text();
      // The browser's own parser and digest, apart from the build's reading of the same pages.
      const found = await page.evaluate(async (source) => {
        const scripts = [...new DOMParser().parseFromString(source, "text/html").scripts];
        const texts = scripts.filter((script) => !script.hasAttribute("src")).map((script) => script.text);
        return Promise.all(
          texts.map(async (text) => {
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
            return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
          }),
        );
      }, html);
      for (const hash of found) hashes.add(hash);
    }
    expect([...hashes].toSorted()).toEqual((served.match(/'sha256-[^']+'/g) ?? []).toSorted());
  });

  test("ends on a navigation under way, which the fixture's last check waits out", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    await page.evaluate(() => {
      location.href = "/w/bubble";
    });
  });

  test("lets a page open a WebSocket to its own host", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          // Ended by whichever comes first: a host with Ergo behind /ws keeps the socket open, and none closes it.
          const socket = new WebSocket(`ws://${location.host}/ws`);
          for (const type of ["open", "error", "close"]) {
            socket.addEventListener(type, () => {
              socket.close();
              resolve();
            });
          }
        }),
    );
    // The fixture flushes what the page reported, and fails the test on any violation.
  });
});

test.describe("a planted violation", () => {
  test.use({ planted: true });

  const plant = (page: Page, code: string) => page.evaluate(code);

  test("is refused and reported, each kind: inline script, eval, foreign image, frame, fetch, socket, form, base", async ({
    page,
    violations,
  }) => {
    await page.goto("/");
    await hydrated(page);
    await plant(
      page,
      "const s = document.createElement('script'); s.textContent = 'window.ran = true'; document.body.append(s)",
    );
    // Code from a string, run later by the page itself: an eval Playwright's own evaluate would escape.
    await plant(page, "setTimeout('window.ran = true', 0)");
    await plant(page, "const i = new Image(); i.src = 'https://evil.test/x.png'; document.body.append(i)");
    await plant(
      page,
      "const f = document.createElement('iframe'); f.src = 'https://evil.test/'; document.body.append(f)",
    );
    await plant(page, "fetch('https://evil.test/x').catch(() => undefined)");
    await plant(page, "new WebSocket('wss://evil.test/ws')");
    await plant(
      page,
      "const f = document.createElement('form'); f.method = 'post'; f.action = 'https://evil.test/'; document.body.append(f); f.requestSubmit()",
    );
    await plant(
      page,
      "const b = document.createElement('base'); b.href = 'https://evil.test/'; document.head.append(b)",
    );
    const kinds = ["base-uri", "connect-src", "connect-src", "form-action", "frame-src", "img-src", "script-src"];
    await expect.poll(() => violations.toSorted()).toEqual([...kinds, "script-src-elem"].toSorted());
    expect(await page.evaluate(() => "ran" in window)).toBe(false);
    // The form and the base element took the page nowhere.
    expect(page.url()).toBe(`${SITE}/`);
  });

  test("is reported from a second tab of the same context too", async ({ page, violations }) => {
    const other = await page.context().newPage();
    await other.goto("/");
    await hydrated(other);
    await plant(other, "setTimeout('window.ran = true', 0)");
    await expect.poll(() => violations).toEqual(["script-src"]);
  });

  test("keeps the page out of another site's frame", async ({ page }) => {
    await page.setContent(`<iframe src="${SITE}/"></iframe>`);
    // Chromium shows its own error page in place of a document its frame-ancestors refuse.
    await expect.poll(() => page.frames()[1]?.url()).toMatch(/^chrome-error:/);
  });
});
