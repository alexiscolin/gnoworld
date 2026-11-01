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

/** Loads a map. */
export async function loadMap(url: string, kind: MapKind, anisotropy: number): Promise<Texture> {
  const loader = new ImageBitmapLoader();
  loader.setOptions({ imageOrientation: "none", premultiplyAlpha: "none" });
  const bitmap = await loader.loadAsync(url);
  const texture = prepareMap(new Texture(bitmap), kind, anisotropy);
  const { width, height } = bitmap;
  texture.onUpdate = () => {
    bitmap.close();
    texture.image = { width, height };
  };
  return texture;
}
