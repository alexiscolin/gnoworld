import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { word } from "./chat.ts";
import { another, logIn, say, type Launcher } from "./irc.ts";
import { goInPage, landed, running } from "./sceneStage.ts";
import type { Space } from "../../src/space/scene.ts";

// The chat wherever a place shows it, however the reader came (Alexis: "from every route and across several, always the chat with no bug"),
// with the real Ergo: each room's two lines shown once each, in order, and an account's line back once; places by ways in, and seeded
// walks, a guest and an account, a computer and a phone.
const PLACES = [
  { path: "/earth", room: "#earth", name: "Earth" },
  { path: "/w/bubble", room: "#bubble", name: "Bubble" },
  { path: "/w/govdao", room: "#govdao", name: "GovDAO" },
  { path: "/w/gnosh-ai", room: "#gnosh-ai", name: "gnosh.ai" },
] as const;
type Place = (typeof PLACES)[number];
// The pages with no chat of their own on a computer: the home, a system, the galaxy, the Map.
const AWAY = ["/", "/s/gnoland", "/universe", "/s/gnoland?view=map"] as const;
const DEVICES = { computer: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;
type Device = keyof typeof DEVICES;
type Who = "guest" | "account";

test.describe.configure({ timeout: 240_000 });

const placeAt = (page: Page): Place | undefined => PLACES.find(({ path }) => new URL(page.url()).pathname === path);
const lines = (page: Page) => page.getByRole("region", { name: "Chat" }).getByRole("list", { name: "Messages" });

// The two lines said in each room before the reader comes, by an account of its own.
async function told(launcher: Launcher): Promise<string> {
  const tag = word("told");
  const teller = await another(launcher, word("teller"));
  for (const { room } of PLACES)
    await say(teller.page, { address: teller.address, room }, [`${tag} 1 in ${room}`, `${tag} 2 in ${room}`]);
  await teller.close();
  return tag;
}

async function reader(page: Page, who: Who, device: Device): Promise<void> {
  await page.setViewportSize(DEVICES[device]);
  await page.addInitScript(() => {
    localStorage.setItem("gnoworld:welcomed", "1");
  });
  if (who === "account") await logIn(page, word("reader"));
}

// The place in view, if it is one with a chat: its two lines once each, the first above the second; an account's line comes back once.
interface Reader {
  tag: string;
  who: Who;
}
async function holds(page: Page, { tag, who }: Reader, how: string): Promise<void> {
  const place = placeAt(page);
  if (place === undefined) return;
  const [first, second] = [`${tag} 1 in ${place.room}`, `${tag} 2 in ${place.room}`];
  await expect(lines(page).getByText(first), `${how}: ${place.path}'s first line`).toHaveCount(1, { timeout: 60_000 });
  await expect(lines(page).getByText(second), `${how}: ${place.path}'s second line`).toHaveCount(1);
  const ordered = await lines(page).evaluate(
    (list, [one, two]) => {
      const texts = [...list.querySelectorAll("li")].map((item) => item.textContent);
      return texts.findIndex((text) => text.includes(one)) < texts.findIndex((text) => text.includes(two));
    },
    [first, second] as const,
  );
  expect(ordered, `${how}: ${place.path}'s lines in order`).toBe(true);
  if (who === "guest") return;
  const sent = word("sent");
  const field = page.getByRole("region", { name: "Chat" }).getByRole("textbox", { name: /^Message / });
  await field.fill(sent);
  // Pressed again till it goes, as the chat asks ("Not sent: the chat is not ready yet. Try again in a moment."): a place whose lines the
  // page kept shows them while its new connection still comes.
  await expect(async () => {
    await field.press("Enter");
    await expect(field).toHaveText("", { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(lines(page).getByText(sent), `${how}: ${place.path}'s sent line`).toHaveCount(1, { timeout: 30_000 });
}

const logo = (page: Page) => page.getByRole("link", { name: "gnoworld" }).click();
async function searched(page: Page, place: Place): Promise<void> {
  // The header's control, pressed again till the palette opens: a page still moving in can take the first press.
  await expect(async () => {
    await page.getByRole("button", { name: "Search", exact: true }).click({ timeout: 2_000 });
    await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("combobox", { name: "Search places" }).fill(place.name);
  await expect(page.getByRole("listbox", { name: "Places" }).getByRole("option").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === place.path);
}

// A seeded draw of a number under `n`, the same for a seed every run.
function picks(seed: number): (n: number) => number {
  let state = seed;
  return (n) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return Math.floor((state / 2147483648) * n);
  };
}

// One step of a walk: a link to a place or to a page with no chat, the browser's back, the search, and on a computer the logo or a place's
// full chat; what it did, for the failure's message.
interface Walk {
  next: (n: number) => number;
  device: Device;
  /** How many of the walk's own pages lie behind this one. */
  went: number;
}
async function walkStep(page: Page, { next, device, went }: Walk): Promise<string> {
  const place = PLACES[next(PLACES.length)] ?? PLACES[0];
  const away = AWAY[next(AWAY.length)] ?? "/";
  // A phone's home sends it on to a chat, and the browser's back goes where it was: neither address is known ahead.
  const awayTo = device === "phone" && away === "/" ? undefined : away.split("?")[0];
  const moves: [string, string | undefined, () => Promise<unknown>][] = [
    [`link to ${place.path}`, place.path, () => goInPage(page, place.path)],
    [`link to ${away}`, awayTo, () => goInPage(page, away)],
    [
      went > 0 ? "back" : `link to ${away}`,
      went > 0 ? undefined : awayTo,
      () => (went > 0 ? page.goBack() : goInPage(page, away)),
    ],
    [`search ${place.name}`, place.path, () => searched(page, place)],
    ["logo", "/", () => logo(page)],
    [`full chat of ${place.path}`, place.path, () => goInPage(page, `${place.path}?chat=full`)],
  ];
  // A phone walks by links and its back alone: its search is the matrix's, its header covered at times by a sheet a step left open.
  const [what, to, move] = moves[next(device === "computer" ? moves.length : 3)] ?? [
    `link to ${place.path}`,
    place.path,
    () => goInPage(page, place.path),
  ];
  await move();
  if (to !== undefined) await expect(page).toHaveURL((url) => url.pathname === to);
  return what;
}

// Each way in, from the place seen once already (its rooms held, as after any flight), through a page with no chat.
const WAYS: Record<string, { computer: boolean; phone: boolean; go: (page: Page, place: Place) => Promise<void> }> = {
  "a link opened cold": {
    computer: true,
    phone: true,
    go: async (page, place) => {
      await page.goto(place.path);
    },
  },
  "a flight back by a link": {
    computer: true,
    phone: true,
    go: async (page, place) => {
      await page.goto(place.path);
      await hydrated(page);
      await goInPage(page, "/s/gnoland");
      await goInPage(page, place.path);
    },
  },
  "the browser's back": {
    computer: true,
    phone: true,
    go: async (page, place) => {
      await page.goto(place.path);
      await hydrated(page);
      await goInPage(page, PLACES.find((other) => other !== place)?.path ?? "/");
      await page.goBack();
    },
  },
  "the logo, then a link": {
    computer: true,
    phone: false,
    go: async (page, place) => {
      await page.goto(place.path);
      await hydrated(page);
      await logo(page);
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await goInPage(page, place.path);
    },
  },
  search: {
    computer: true,
    phone: true,
    go: async (page, place) => {
      await page.goto(place.path);
      await hydrated(page);
      await goInPage(page, "/universe");
      await searched(page, place);
    },
  },
  "the header's Chat": {
    computer: true,
    phone: false,
    go: async (page, place) => {
      await page.goto(place.path);
      await hydrated(page);
      await page.getByRole("link", { name: `Chat of ${place.name}` }).click();
    },
  },
};

for (const who of ["guest", "account"] as const)
  for (const device of ["computer", "phone"] as const)
    test.describe(`the chat, ${who}, on a ${device}`, () => {
      for (const [how, way] of Object.entries(WAYS)) {
        if (!way[device]) continue;
        test(`every place's chat by ${how}`, async ({ page, playwright, launchOptions }) => {
          const tag = await told({ playwright, launchOptions });
          await reader(page, who, device);
          for (const place of PLACES) {
            await way.go(page, place);
            await expect(page).toHaveURL((url) => url.pathname === place.path);
            await holds(page, { tag, who }, `${how} to ${place.path}`);
          }
        });
      }

      // A seeded walk: each step a way the reader moves, the chat checked after each.
      for (const seed of [1, 2]) {
        test(`a walk of 14 steps, seed ${String(seed)}`, async ({ page, playwright, launchOptions }) => {
          const tag = await told({ playwright, launchOptions });
          await reader(page, who, device);
          await page.goto("/earth");
          await hydrated(page);
          const next = picks(seed);
          const steps: string[] = [];
          // The pages the walk itself went to, which its back may return through: never before its first.
          let depth = 0;
          for (let step = 0; step < 14; step += 1)
            await test.step(`step ${String(step)}`, async () => {
              const what = await walkStep(page, { next, device, went: depth });
              depth += what === "back" ? -1 : 1;
              steps.push(what);
              await holds(page, { tag, who }, steps.join(" > "));
            });
        });
      }
    });

// Alexis's own way: flights, the logo, then the Earth clicked in the scene, an account on a wide computer.
test("the Earth's chat after the logo and a click on it in the scene", async ({ page, playwright, launchOptions }) => {
  const tag = await told({ playwright, launchOptions });
  await reader(page, "account", "computer");
  await page.setViewportSize({ width: 1728, height: 1080 });
  await page.goto("/earth?test-gpu");
  await hydrated(page);
  await running(page);
  await holds(page, { tag, who: "account" }, "the Earth first");
  for (const path of ["/w/bubble", "/s/gnoland", "/w/govdao", "/universe"]) await goInPage(page, path);
  await logo(page);
  await landed(page);
  const spot = await page.evaluate(() => {
    const { universe, seconds, see } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
    const earth = universe?.planets.find(({ id }) => id === "earth");
    if (earth === undefined) return undefined;
    const angle = earth.phase + earth.speed * seconds;
    const { place, across, along } = earth.system;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const at = {
      x: place.x + (across.x * cos + along.x * sin) * earth.orbit,
      y: place.y + (across.y * cos + along.y * sin) * earth.orbit,
      z: place.z + (across.z * cos + along.z * sin) * earth.orbit,
    };
    const on = { x: 0, y: 0, z: 0 };
    return see.project(at, on) ? { x: on.x, y: on.y } : undefined;
  });
  expect(spot, "the Earth on screen from the home").toBeDefined();
  await page.mouse.click(spot?.x ?? 0, spot?.y ?? 0);
  await expect(page).toHaveURL((url) => url.pathname === "/earth", { timeout: 90_000 });
  await holds(page, { tag, who: "account" }, "the logo, then the Earth in the scene");
});
