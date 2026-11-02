// A row's colours as they are written, in sRGB hex, and the airs and lava more than one row shares.
import type { Ramp, Rgb } from "./anchors.ts";

export const rgb = (hex: number): Rgb => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
export const ramp = (low: number, mid: number, high: number): Ramp => [rgb(low), rgb(mid), rgb(high)];

// Every air is drawn as the Earth's is (a max channel near 0.55, a thickness of 0.05 at most), each in its own colour.
export const SKY: readonly [Rgb, Rgb] = [rgb(0x335289), rgb(0x3a5e8c)];
export const LAVA: Rgb = rgb(0xf4753e);
