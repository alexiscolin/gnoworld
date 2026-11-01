// The small set of real maps every world shares (ADR-0002 §3): one owner for them all, whatever the count of worlds. WebP, decoded by the
// browser off the main thread, so no page's CSP widens (the plan, section 3). A bitmap is closed once uploaded: its bytes would count twice.
import {
  ClampToEdgeWrapping,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "three";

type MapKind = "colour" | "data";

export interface MapLoad {
  readonly kind: MapKind;
  readonly anisotropy: number;
  /** Decoded to this width, a map being twice as wide as it is high. */
  readonly width?: number;
}

const MIPMAPS = 4 / 3;

/** Where a map is, for a site served at `base`. */
export const mapUrl = (name: string, base: string): string => `${base}textures/${name}.webp`;

/** Sets what a map needs before its first use: a colour map is decoded by the GPU, a data map stays linear, on one channel. */
export function prepareMap(texture: Texture, kind: MapKind, anisotropy: number): Texture {
  texture.colorSpace = kind === "colour" ? SRGBColorSpace : NoColorSpace;
  if (kind === "data") texture.format = RedFormat;
  texture.flipY = false;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** What `textures` take on the GPU, each once: three has no counter of bytes. */
export function mapBytes(textures: Iterable<Texture>): number {
  let bytes = 0;
  for (const texture of new Set(textures)) {
    const image = texture.image as { width?: number; height?: number } | null;
    const pixels = (image?.width ?? 0) * (image?.height ?? 0);
    bytes += Math.round(pixels * (texture.format === RedFormat ? 1 : 4) * MIPMAPS);
  }
  return bytes;
}

/** How the browser decodes a map, in full or scaled at once, so a small device never holds the full size. */
export function decodeOptions(width: number | undefined): ImageBitmapOptions {
  const drawn: ImageBitmapOptions = { imageOrientation: "none", premultiplyAlpha: "none" };
  return width === undefined ? drawn : { ...drawn, resizeWidth: width, resizeHeight: width / 2, resizeQuality: "high" };
}

/** Frees a map, and its bitmap if it was never uploaded: the upload closes it, and three never would. */
export function freeMap(texture: Texture): void {
  texture.dispose();
  (texture.image as Partial<ImageBitmap>).close?.();
}

/** Loads a map. */
export async function loadMap(url: string, { kind, anisotropy, width }: MapLoad): Promise<Texture> {
  const loader = new ImageBitmapLoader();
  loader.setOptions(decodeOptions(width));
  const bitmap = await loader.loadAsync(url);
  const texture = prepareMap(new Texture(bitmap), kind, anisotropy);
  const size = { width: bitmap.width, height: bitmap.height };
  texture.onUpdate = () => {
    bitmap.close();
    texture.image = size;
  };
  return texture;
}
