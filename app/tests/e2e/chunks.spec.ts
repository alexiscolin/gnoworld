import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { closureOf, fileOf, LATE, lateWeights, weigh } from "./chunks.ts";
import { BUILD } from "./sites.ts";

// The late chunks weighed from the built files, with no page (Alexis, 2026-11-04: "Oui, les deux"): Playwright's own `test`, which opens
// no browser for a test that asks for no page, as the journeys' fixtures would. Each case but the last writes a folder of assets of its own.
const assets = (files: Record<string, string>) => {
  const folder = join(mkdtempSync(join(tmpdir(), "chunks-")), "assets");
  mkdirSync(folder);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text);
  return folder;
};
const gzipped = (text: string) => gzipSync(new TextEncoder().encode(text)).length;

test("every late chunk of the build stays within its cap, weighed from its files", { tag: "@gate" }, () => {
  for (const { chunk, files, bytes, cap } of lateWeights(fileURLToPath(new URL("client/assets/", BUILD))))
    expect(bytes, `${chunk}: ${files.join(", ")}`).toBeLessThanOrEqual(cap);
});

test("finds a chunk by its name alone, and refuses a name of no file or of two", { tag: "@gate" }, () => {
  const folder = assets({
    "scene-AAAAAAAA.js": "1",
    "sceneView-BBBBBBBB.js": "2",
    "cosmos-CCCCCCCC.js": "3",
    "cosmos-DD_D-DDD.js": "4",
  });
  expect(fileOf(folder, "scene")).toBe("scene-AAAAAAAA.js");
  expect(() => fileOf(folder, "rail")).toThrow(/rail/);
  expect(() => fileOf(folder, "cosmos")).toThrow(/cosmos/);
});

test("follows the static imports at any depth, never a dynamic one", { tag: "@gate" }, () => {
  const folder = assets({
    "a-AAAAAAAA.js": 'import"./b-BBBBBBBB.js";import("./late-LLLLLLLL.js");',
    "b-BBBBBBBB.js": 'import{x}from"./c-CCCCCCCC.js";',
    "c-CCCCCCCC.js": 'import "./a-AAAAAAAA.js";',
    "late-LLLLLLLL.js": "",
  });
  expect(closureOf(folder, "a-AAAAAAAA.js").sort()).toEqual(["a-AAAAAAAA.js", "b-BBBBBBBB.js", "c-CCCCCCCC.js"]);
});

test(
  "weighs a text with the hashed names of other files as one fixed string, file by file, as gzip sends it",
  { tag: "@gate" },
  () => {
    const text = (hash: string) => `import"./scene-${hash}.js";url(./font-${hash}.woff2);import"./cosmos-${hash}.css";`;
    const one = assets({ "a-AAAAAAAA.js": text("AAAAAAAA") });
    const other = assets({ "a-AAAAAAAA.js": text("Zq7_x9-K") });
    expect(weigh(one, ["a-AAAAAAAA.js"])).toBe(weigh(other, ["a-AAAAAAAA.js"]));
    expect(weigh(one, ["a-AAAAAAAA.js"])).toBe(gzipped(text("xxxxxxxx")));
    const two = assets({ "a-AAAAAAAA.js": "export const a=1;", "b-BBBBBBBB.js": "export const b=2;" });
    expect(weigh(two, ["a-AAAAAAAA.js", "b-BBBBBBBB.js"])).toBe(
      gzipped("export const a=1;") + gzipped("export const b=2;"),
    );
  },
);

test(
  "weighs a late chunk with what it brings, apart from the chunks before it, or alone where its row says",
  { tag: "@gate" },
  () => {
    const files: Record<string, string> = {};
    for (const { chunk, after } of LATE) {
      files[`${chunk}-AAAAAAAA.js`] = `export const ${chunk}=1;`;
      for (const name of after ?? []) files[`${name}-AAAAAAAA.js`] = `export const ${name}=2;`;
    }
    files["scene-AAAAAAAA.js"] = 'import"./three-TTTTTTTT.js";import"./shared-SSSSSSSS.js";';
    files["three-TTTTTTTT.js"] = "export const three=3;";
    files["shared-SSSSSSSS.js"] = "export const shared=4;";
    files["root-AAAAAAAA.js"] = 'import"./shared-SSSSSSSS.js";import"./maps-MMMMMMMM.js";';
    files["maps-MMMMMMMM.js"] = "export const maps=5;";
    files["generated-AAAAAAAA.js"] = 'import"./shared-SSSSSSSS.js";export const g=6;';
    const folder = assets(files);
    const weights = new Map(lateWeights(folder).map((each) => [each.chunk, each]));
    // The scene brings three and what `root` does not already hold (`shared`, which `root` imports, is not its weight).
    expect(weights.get("scene")?.files.sort()).toEqual(["scene-AAAAAAAA.js", "three-TTTTTTTT.js"]);
    expect(weights.get("scene")?.bytes).toBe(weigh(folder, ["scene-AAAAAAAA.js", "three-TTTTTTTT.js"]));
    expect(weights.get("generated")?.files).toEqual(["generated-AAAAAAAA.js"]);
    expect([...weights.keys()].sort()).toEqual(LATE.map(({ chunk }) => chunk).sort());
    for (const { chunk, cap } of LATE) expect(weights.get(chunk)?.cap, chunk).toBe(cap);
  },
);
