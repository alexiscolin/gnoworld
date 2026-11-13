// One WebP encode for the texture tools, in the browser's canvas (no dependency): `draw(args)` runs in the page and returns the canvas.
/** The WebP bytes of the canvas `draw(args)` makes in `page`, at `quality`. */
export async function encodeWebp(page, draw, args, quality) {
  const base64 = await page.evaluate(
    async ({ source, args, quality }) => {
      const canvas = await (0, eval)(`(${source})`)(args);
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      const reader = new FileReader();
      return new Promise((done) => {
        reader.onload = () => done(String(reader.result).split(",")[1]);
        reader.readAsDataURL(blob);
      });
    },
    { source: draw.toString(), args, quality },
  );
  return Buffer.from(base64, "base64");
}
