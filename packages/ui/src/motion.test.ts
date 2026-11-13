import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { motionWelcome } from "./motion.ts";

// The browser's answer to either form of the system's word.
const media = (reduce: boolean) => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: no-preference)" ? !reduce : reduce,
  }));
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset["motion"];
  document.documentElement.style.removeProperty("--motion-scale");
});

describe("motionWelcome", () => {
  it("is true when nothing asks for calm", () => {
    media(false);
    expect(motionWelcome()).toBe(true);
  });

  it("is false at the system's word, at the app's Reduce animations setting, and at a zero motion scale", () => {
    media(true);
    expect(motionWelcome()).toBe(false);
    media(false);
    document.documentElement.dataset["motion"] = "reduce";
    expect(motionWelcome()).toBe(false);
    delete document.documentElement.dataset["motion"];
    document.documentElement.style.setProperty("--motion-scale", "0");
    expect(motionWelcome()).toBe(false);
  });
});

// jsdom runs no animation: the sheets that move are read as text, by their path. The app's "Reduce animations" setting zeroes
// --motion-scale (tokens.css) and a @media on the system's word never sees it, so each animation scales by it.
// This project's module URLs start at the repository's root (/packages/…), where Vitest runs.
const read = (url: URL) => readFileSync(`.${url.pathname}`, "utf8");
const SHEETS: [string, URL][] = [
  ["./ActivityChart/DayChart", new URL("./ActivityChart/DayChart.module.css", import.meta.url)],
  ["./Button/Button", new URL("./Button/Button.module.css", import.meta.url)],
  ["./Chip/Chip", new URL("./Chip/Chip.module.css", import.meta.url)],
  ["./Figures/Figures", new URL("./Figures/Figures.module.css", import.meta.url)],
  ["./Network/Network", new URL("./Network/Network.module.css", import.meta.url)],
  ["./Skeleton/Skeleton", new URL("./Skeleton/Skeleton.module.css", import.meta.url)],
  ["./Sparkline/Sparkline", new URL("./Sparkline/Sparkline.module.css", import.meta.url)],
  [
    "../../../app/src/features/calls/CallCard",
    new URL("../../../app/src/features/calls/CallCard.module.css", import.meta.url),
  ],
  [
    "../../../app/src/routes/plate/Callers",
    new URL("../../../app/src/routes/plate/Callers.module.css", import.meta.url),
  ],
  ["../../../app/src/routes/plate/Hero", new URL("../../../app/src/routes/plate/Hero.module.css", import.meta.url)],
  [
    "../../../app/src/routes/plate/TalkBar",
    new URL("../../../app/src/routes/plate/TalkBar.module.css", import.meta.url),
  ],
];

describe("the animations of the sheets", () => {
  it.each(SHEETS)("%s: every animation's duration is scaled by --motion-scale", (_, sheet) => {
    const css = read(sheet);
    const animations = css.match(/^\s*animation:[^;]*;/gm) ?? [];
    expect(animations.length).toBeGreaterThan(0);
    for (const each of animations) expect(each).toContain("--motion-scale");
  });

  it("the space loader's fill and fade scale by it too", () => {
    const css = read(new URL("../../../app/src/features/universe/SpaceLoader.module.css", import.meta.url));
    expect(css).not.toContain("prefers-reduced-motion");
    for (const each of css.match(/^\s*transition:[^;]*;/gm) ?? []) expect(each).toContain("--motion-scale");
  });

  // The settings' word ran the 25 beats in no time and held the last one, faded out; the system's word left the ring at 0.8.
  it("EarthSigns' rings rest at 0.8 under either word for reduced motion, and fade out after their beats otherwise", () => {
    const css = read(new URL("../../../app/src/EarthSigns.module.css", import.meta.url));
    const rings = /\n {2}\.rings \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rings).toMatch(/animation: ring [^;]*--motion-scale[^;]* 25;/);
    expect(rings).toContain("opacity: calc(0.8 * (1 - var(--motion-scale)));");
    expect(css).not.toMatch(/\.rings[^{]*\{[^}]*(animation: none|opacity: 0\.8;)/);
  });
});
