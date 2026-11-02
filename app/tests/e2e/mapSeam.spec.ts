import { LOOKUP } from "../../src/scene/planet/chunks.ts";
import { expect, test, type Page } from "./fixtures.ts";

// Where a map's two ends meet, a lookup that takes the wrong longitude, or another's derivatives, reads a far mip or a far place: a line
// down every world. This runs the shader's own lookup in WebGL2 over a probe map, at both longitudes where one of the two values jumps.
// Its limit: a software GPU rounds alike in every pixel of a quad, so the shimmer of a real GPU cannot show here (b373ac20); this holds the choice.
const WIDTH = 256;
const HEIGHT = 128;

const VERTEX = `#version 300 es
out vec2 place;
void main() {
  place = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
  gl_Position = vec4(place, 0.0, 1.0);
}
`;

// A slice of the equator round `centre`, a radian across. The seam runs aslant, or it could fall between two quads and no derivative would cross it.
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D probe;
uniform float centre;
in vec2 place;
out vec4 colour;
${LOOKUP}
void main() {
  float longitude = centre + place.x * 0.6 + place.y * 0.07;
  float latitude = place.y * 0.6;
  colour = read(probe, lookupOf(vec3(cos(latitude) * cos(longitude), sin(latitude), cos(latitude) * sin(longitude))));
}
`;

interface Seen {
  /** The lightest and darkest of the middle third, inside the probe's dark band. */
  readonly lightest: number;
  readonly darkest: number;
  /** The tone at the slice's edge, past the band. */
  readonly edge: number;
}

const look = (page: Page, centre: number): Promise<Seen> =>
  page.evaluate(
    ([vertex, fragment, longitude, width, height]) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const gl = canvas.getContext("webgl2");
      if (gl === null) throw new Error("no WebGL2");
      const program = gl.createProgram();
      const attach = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (shader === null) throw new Error("no shader");
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true)
          throw new Error(gl.getShaderInfoLog(shader) ?? "");
        gl.attachShader(program, shader);
      };
      attach(gl.VERTEX_SHADER, vertex);
      attach(gl.FRAGMENT_SHADER, fragment);
      gl.linkProgram(program);
      gl.useProgram(program);
      // Dark round each place a longitude jumps, light elsewhere, so that a far mip, the mean of both, or a far place, reads light.
      const toneAt = (u: number) => (Math.min(u, Math.abs(u - 0.5), 1 - u) < 1 / 16 ? 51 : 204);
      const probe = new Uint8Array(width * height * 4);
      for (let at = 0; at < width * height; at += 1)
        probe.fill(toneAt(((at % width) + 0.5) / width), at * 4, at * 4 + 4);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, probe);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.uniform1f(gl.getUniformLocation(program, "centre"), longitude);
      gl.viewport(0, 0, width, height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const drawn = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, drawn);
      const redAt = (x: number, y: number) => drawn[(y * width + x) * 4] ?? 0;
      const middle: number[] = [];
      for (let y = 0; y < height; y += 1)
        for (let x = Math.round(width / 3); x < Math.round((width * 2) / 3); x += 1) middle.push(redAt(x, y));
      return { lightest: Math.max(...middle), darkest: Math.min(...middle), edge: redAt(0, height >> 1) };
    },
    [VERTEX, FRAGMENT, centre, WIDTH, HEIGHT] as const,
  );

test.describe("a map's seam", () => {
  for (const [where, centre] of [
    ["where the map's two ends meet", Math.PI],
    ["where the longitude read the other way wraps", 0],
  ] as const)
    test(`reads the map's own texels ${where}, with no far mip and no far place`, async ({ page }) => {
      await page.goto("about:blank");
      const { lightest, darkest, edge } = await look(page, centre);
      expect(lightest).toBeLessThan(60);
      expect(darkest).toBeGreaterThan(45);
      expect(edge, "the probe really is read").toBeGreaterThan(190);
    });
});
