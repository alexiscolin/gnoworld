// The pictures of the real planets, taken once from the scene (app/tests/tools/planetPictures.spec.ts) and served with the site: a world's
// path, or nothing where none was taken, and ui's disc stands in.
import manifest from "./worldPictures.json" with { type: "json" };
import { pictureFile } from "./pictureFile.ts";

const INPUTS = new Map(Object.entries(manifest));

/** The path of the world `id`'s picture, 88 px for a 44 px planet at twice the pixels. */
export function pictureOf(id: string): string | undefined {
  const inputs = INPUTS.get(id);
  return inputs === undefined ? undefined : `${import.meta.env.BASE_URL}world-pictures/${pictureFile(id, inputs)}`;
}
