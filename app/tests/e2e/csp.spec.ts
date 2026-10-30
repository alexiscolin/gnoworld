import { readFileSync } from "node:fs";
import { controlled, expect, hydrated, PAGES, test, type Page } from "./fixtures.ts";
import { headerRules, nginxTable } from "./cspFiles.mjs";
import { GUARDED, SITE } from "./sites.ts";

// The policy's shape: the unit test pins its words, this the page's every answer (slice 3's plan, 3f).
const SHAPE = new RegExp(
  "^default-src 'none'; script-src 'self'( 'sha256-[A-Za-z0-9+/]{43}=')*; style-src 'self'; img-src 'self' data:; " +
    "font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; " +
    "frame-src https://www.youtube-nocookie.com/embed/ https://player.vimeo.com/video/ https://giphy.com/embed/; " +
    "base-uri 'none'; " +
    "form-action 'self'; frame-ancestors 'none'$",
);
const HASH = /'sha256-[^']+'/g;
const PASSWORD = `Basic ${btoa("team:a test password")}`;
const BUILD = new URL("../../build/", import.meta.url);

test.describe("the content security policy", () => {
  // 5f: one policy a page, not one for all of them: a page's holds its own scripts' hashes, so a host that cuts a line at
  // 2,000 characters (Cloudflare Pages) takes any number of worlds by line length; its 100 rules take about 20 (the build
  // stops past them, F2452).
  test("is a policy of the right shape on every answer: each page, the fallback, files, a 400, a 401 and a 500", async ({
    request,
  }) => {
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
      // Each page, the worker, the manifest, the icon, and the guarded home with its password.
      [...PAGES.map(() => 200), 200, 200, 200, 200, 400, 401, 404, 404, 404, 500].toSorted(),
    );
    for (const answer of answers) expect(answer.headers()["content-security-policy"]).toMatch(SHAPE);
  });

  // F2451: a _headers host matches the request path, and a path no page names is served a document that runs the app.
  test("gives a path the build never made the catch-all's policy, not none", async ({ request }) => {
    const headers = readFileSync(new URL("client/_headers", BUILD), "utf8");
    const catchAll = headerRules(headers).get("/*");
    expect(catchAll).toMatch(SHAPE);
    expect(catchAll?.match(HASH)?.length).toBeGreaterThan(5);
    for (const path of ["/nowhere", "/w/Bubble", "/net/onyx/w/none/", "/w/bubble/index.html"]) {
      const answer = await request.get(path);
      expect(answer.headers()["content-security-policy"], path).toBe(catchAll);
    }
  });

  test("gives each page a policy of its own, under a host's 2,000-character line, and another at its canonical address", async ({
    request,
  }) => {
    const served = new Map<string, string>();
    for (const path of PAGES) {
      const policy = String((await request.get(path)).headers()["content-security-policy"]);
      served.set(path, policy);
      expect(`  Content-Security-Policy: ${policy}`.length, path).toBeLessThan(2000);
      // A page holds its scripts: React Router's five, so five hashes.
      expect(policy.match(HASH), path).toHaveLength(5);
    }
    // A world's page and the home differ in their scripts (the routes' files, the loader data): not the same policy.
    expect(new Set(served.values()).size).toBeGreaterThan(1);
    // A page's path and its canonical address hold different loader data: a policy of its own for each.
    expect(served.get("/w/bubble")).not.toBe(served.get("/net/onyx/w/bubble"));
  });

  test("is the same in the three places a host reads it: _headers, nginx's table and the test host", async ({
    request,
  }) => {
    const headers = readFileSync(new URL("client/_headers", BUILD), "utf8");
    const nginx = readFileSync(new URL("csp.conf", BUILD), "utf8");
    expect(nginx).toMatch(/^map \$uri \$csp \{$/m);
    // Read as a host and nginx read them, apart from how the build wrote them: a rule's path, its policy line; a key, its value.
    const rules = headerRules(headers);
    const table = nginxTable(nginx);
    for (const path of PAGES) {
      const served = String((await request.get(path)).headers()["content-security-policy"]);
      expect(rules.get(path), path).toBe(served);
      expect(table.get(path), path).toBe(served);
    }
  });

  test("names, for each page, the hash of every inline script the page holds, as the browser parses it, and no other", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    // The pre-rendered pages, and the fallback a path the build never made gets.
    for (const path of [...PAGES, "/nowhere"]) {
      const answer = await request.get(path);
      const served = String(answer.headers()["content-security-policy"]);
      const html = await answer.text();
      // The browser's own parser and digest, apart from the build's reading of the same pages. A JSON-LD block runs nothing: no hash.
      const found = await page.evaluate(async (source) => {
        const scripts = [...new DOMParser().parseFromString(source, "text/html").scripts];
        const texts = scripts
          .filter((script) => !script.hasAttribute("src") && script.type !== "application/ld+json")
          .map((script) => script.text);
        return Promise.all(
          texts.map(async (text) => {
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
            return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
          }),
        );
      }, html);
      const named = served.match(HASH) ?? [];
      // A path the build never made falls to the catch-all, which names the home's scripts as well (F2451).
      if (path === "/nowhere") for (const hash of found) expect(named, path).toContain(hash);
      else expect(found.toSorted(), path).toEqual(named.toSorted());
    }
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

  // F883: a service's own site is no player: a frame of youtube.com, not youtube-nocookie.com, is refused.
  test("refuses a frame of a host the players' list does not name", async ({ page, violations }) => {
    await page.goto("/");
    await hydrated(page);
    await plant(
      page,
      "const f = document.createElement('iframe'); f.src = 'https://www.youtube.com/embed/dQw4w9WgXcQ'; document.body.append(f)",
    );
    await expect.poll(() => violations).toEqual(["frame-src"]);
  });

  // F885: frame-src names each service's player by its path, so its host's other pages are refused; any such page
  // let through is answered here, the test reaching no one.
  test("refuses a frame of an accepted host outside its player's path", async ({ page, violations }) => {
    await page.route(/^https:\/\/(?:www\.youtube-nocookie\.com|player\.vimeo\.com|giphy\.com)\//, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>page</title>" }),
    );
    await page.goto("/");
    await hydrated(page);
    for (const src of [
      "https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ",
      "https://player.vimeo.com/76979871",
      "https://giphy.com/gifs/4548k01F5Ej28",
    ]) {
      await plant(page, `const f = document.createElement('iframe'); f.src = '${src}'; document.body.append(f)`);
    }
    await expect.poll(() => violations).toEqual(["frame-src", "frame-src", "frame-src"]);
  });

  test("is reported from a second tab of the same context too", async ({ page, violations }) => {
    const other = await page.context().newPage();
    await other.goto("/");
    await hydrated(other);
    await plant(other, "setTimeout('window.ran = true', 0)");
    await expect.poll(() => violations).toEqual(["script-src"]);
  });

  // F468: the worker has a global scope of its own, where the page's listener never runs.
  test("is reported from inside the service worker too: a fetch the worker makes to another site", async ({
    page,
    violations,
  }) => {
    await page.goto("/");
    await controlled(page);
    const context = page.context();
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const result = await worker.evaluate(() =>
      fetch("https://evil.test/x").then(
        () => "reached",
        () => "refused",
      ),
    );
    expect(result).toBe("refused");
    await expect.poll(() => violations).toEqual(["connect-src"]);
  });

  test("keeps the page out of another site's frame", async ({ page }) => {
    await page.setContent(`<iframe src="${SITE}/"></iframe>`);
    // Chromium shows its own error page in place of a document its frame-ancestors refuse.
    await expect.poll(() => page.frames()[1]?.url()).toMatch(/^chrome-error:/);
  });
});
