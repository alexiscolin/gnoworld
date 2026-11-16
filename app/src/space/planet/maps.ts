// How a real map comes and goes: the Earth's, and the small set every world shares (ADR-0002 §3), one owner for them all.
// WebP, decoded by the browser off the main thread, so no page's CSP widens. A bitmap is closed once uploaded:
// its bytes would count twice.
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
export { mapUrl } from "./mapUrl.ts";

type MapKind = "colour" | "data";

export interface MapLoad {
  readonly kind: MapKind;
  readonly anisotropy: number;
  /** Decoded to this width, a map being twice as wide as it is high. */
  readonly width?: number;
  /** Going, it stops the fetch. */
  readonly signal?: AbortSignal;
}

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
export async function loadMap(url: string, { kind, anisotropy, width, signal }: MapLoad): Promise<Texture> {
  signal?.throwIfAborted();
  const loader = new ImageBitmapLoader();
  loader.setOptions(decodeOptions(width));
  signal?.addEventListener(
    "abort",
    () => {
      loader.abort();
    },
    { once: true },
  );
  const bitmap = await loader.loadAsync(url);
  const texture = prepareMap(new Texture(bitmap), kind, anisotropy);
  const size = { width: bitmap.width, height: bitmap.height };
  texture.onUpdate = () => {
    bitmap.close();
    texture.image = size;
  };
  return texture;
}
