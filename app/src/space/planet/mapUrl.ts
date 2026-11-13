// Where a map's file is: its own module, with no three in it, so the build can name the first frame's maps in the home's HTML.
import files from "./mapFiles.json" with { type: "json" };

const FILES: Readonly<Record<string, string>> = files;

/** Where a map is, for a site served at `base`: the smallest file at or above `width`, the widest if none or no width is asked. A map's
 * files halve from its widest to its narrowest, and their names hold their width and one hash of them (mapFiles.json,
 * app/tests/tools/textureVariants.mjs), so a browser keeps them for good. A name with no file is a 404, as it was. */
export function mapUrl(name: string, base: string, width = Infinity): string {
  const [hash, widest, narrowest] = FILES[name]?.split(" ") ?? [];
  if (hash === undefined) return `${base}textures/${name}.webp`;
  let chosen = Number(narrowest);
  while (chosen < width && chosen < Number(widest)) chosen *= 2;
  return `${base}textures/${name}.${String(chosen)}.${hash}.webp`;
}
