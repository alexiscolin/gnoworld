import { MAPS } from "@gnoworld/core";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { decodeOptions, freeMap, loadMap, mapBytes, mapUrl, prepareMap } from "./maps.ts";

const decoded = vi.hoisted(() => ({ bitmap: { width: 4096, height: 2048, close: vi.fn() } }));

vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  ImageBitmapLoader: class {
    setOptions() {
      return this;
    }
    loadAsync() {
      return Promise.resolve(decoded.bitmap);
    }
  },
}));

const sized = (width: number, height: number, format?: typeof RedFormat): Texture => {
  const texture = new Texture({ width, height });
  if (format !== undefined) texture.format = format;
  return texture;
};

describe("mapUrl", () => {
  it("names each map's WebP under the site's textures", () => {
    for (const name of MAPS) expect(mapUrl(name, "/")).toBe(`/textures/${name}.webp`);
  });

  it("follows the base the page is served from", () => {
    expect(mapUrl("mars", "/lab/")).toBe("/lab/textures/mars.webp");
  });
});

describe("prepareMap", () => {
  it("reads a colour map as sRGB, with its mipmaps", () => {
    const texture = prepareMap(new Texture(), "colour", 16);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.anisotropy).toBe(16);
    expect(texture.version).toBe(1);
  });

  it("closes the seam east to west, and clamps at the poles", () => {
    const texture = prepareMap(new Texture(), "colour", 4);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(ClampToEdgeWrapping);
  });

  it("keeps a data map out of colour management, on one channel", () => {
    const texture = prepareMap(new Texture(), "data", 4);
    expect(texture.colorSpace).toBe(NoColorSpace);
    expect(texture.format).toBe(RedFormat);
  });

  it("never flips a bitmap, which the loader would ignore", () => {
    expect(prepareMap(new Texture(), "colour", 4).flipY).toBe(false);
  });
});

describe("decodeOptions", () => {
  it("decodes a bitmap as it was drawn: never flipped, never premultiplied", () => {
    expect(decodeOptions(undefined)).toEqual({ imageOrientation: "none", premultiplyAlpha: "none" });
  });

  it("scales it to a 2:1 map of the width asked, in the browser's decoder, so a Low device never holds the full size", () => {
    expect(decodeOptions(2048)).toEqual({
      imageOrientation: "none",
      premultiplyAlpha: "none",
      resizeWidth: 2048,
      resizeHeight: 1024,
      resizeQuality: "high",
    });
  });
});

describe("loadMap", () => {
  it("closes the bitmap once uploaded, and keeps its size for what counts the bytes", async () => {
    decoded.bitmap.close.mockClear();
    const texture = await loadMap("/textures/earth-day.webp", { kind: "colour", anisotropy: 4 });
    expect(decoded.bitmap.close).not.toHaveBeenCalled();
    texture.onUpdate?.(texture);
    expect(decoded.bitmap.close).toHaveBeenCalledTimes(1);
    expect(texture.image).toEqual({ width: 4096, height: 2048 });
    expect(mapBytes([texture])).toBe(Math.round(4096 * 2048 * 4 * (4 / 3)));
  });
});

describe("freeMap", () => {
  it("frees the texture and closes a bitmap never uploaded", () => {
    const close = vi.fn();
    const texture = new Texture({ width: 4, height: 2, close });
    const disposed = vi.spyOn(texture, "dispose");
    freeMap(texture);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("leaves a map already uploaded, whose bitmap went then, to three", () => {
    const texture = new Texture({ width: 4, height: 2 });
    const disposed = vi.spyOn(texture, "dispose");
    freeMap(texture);
    expect(disposed).toHaveBeenCalledTimes(1);
  });
});

describe("mapBytes", () => {
  it("counts four bytes a pixel and a third more for the mipmaps", () => {
    expect(mapBytes([sized(2048, 1024)])).toBe(11184811);
  });

  it("counts one byte a pixel on one channel", () => {
    expect(mapBytes([sized(2048, 1024, RedFormat)])).toBe(2796203);
  });

  it("adds up the maps, each once, however many planets share it", () => {
    const one = sized(1024, 512);
    expect(mapBytes([one, one, sized(1024, 512)])).toBe(mapBytes([one]) * 2);
  });

  it("counts nothing for a map still loading", () => {
    expect(mapBytes([new Texture()])).toBe(0);
  });
});
