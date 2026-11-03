import { ShaderChunk, ShaderLib } from "three";
import { describe, expect, it } from "vitest";
import { glslSpaces, stripChunk as stripWith, stripGlsl } from "./glsl.ts";
import { ORBITING } from "./scene/cosmos/dots.ts";
import { AIR_FRAGMENT, AIR_VERTEX } from "./scene/planet/airShader.ts";
import { FIELD, LOOKUP, SEAMS } from "./scene/planet/chunks.ts";
import { DETAIL, FORMS, NOISE } from "./scene/planet/generatedParts.ts";
import { GENERATED_FRAGMENT } from "./scene/planet/generatedShader.ts";
import { RING_FRAGMENT, RING_VERTEX } from "./scene/planet/ringShader.ts";
import { HALO_FRAGMENT, HALO_VERTEX, LIGHT_UNIFORMS, LIGHTS } from "./scene/planet/signShaders.ts";
import { COMMON, PARTS, SHADE, TURNED } from "./scene/planet/surfaceParts.ts";
import { SURFACE_VERTEX } from "./scene/planet/surfaceShader.ts";

// Vite's own parser, which the build hands the plugin: loaded as it runs, for its types would bring Node's into the browser's program.
const VITE = "vite";
const loaded: unknown = await import(/* @vite-ignore */ VITE);
if (typeof loaded !== "object" || loaded === null || !("parseSync" in loaded) || typeof loaded.parseSync !== "function")
  throw new Error("no parser in vite");
const { parseSync } = loaded as { parseSync: (name: string, code: string, options: object) => { program: unknown } };
const parse = (code: string) => parseSync("chunk.js", code, { sourceType: "module" }).program;
const stripChunk = (code: string) => stripWith(code, parse);

// The shaders' spaces stripped at build (Alexis, 2026-11-03, "avec ses tests"): the spaces a GLSL compiler skips, out of the chunks the
// browser downloads, three's and ours; every token kept, in order, and every line the preprocessor reads kept whole.

// GLSL's tokens by maximal munch, as a compiler reads them: a preprocessor line whole, then names, numbers and operators, comments skipped.
const OPERATORS = [
  "<<=",
  ">>=",
  "++",
  "--",
  "<<",
  ">>",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "^^",
  "+=",
  "-=",
  "*=",
  "/=",
];
const MORE = ["%=", "&=", "|=", "^="];
function tokensOf(glsl: string): string[] {
  const tokens: string[] = [];
  // A comment is whichever kind starts first: `// x /* y` is a line's comment, and the next line is code.
  for (const line of glsl
    .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (comment) => (comment.startsWith("//") ? "" : " "))
    .split("\n")) {
    const text = line.trim();
    if (text.startsWith("#")) {
      tokens.push(text.replace(/\s+/g, " "));
      continue;
    }
    for (let at = 0; at < text.length;) {
      const rest = text.slice(at);
      const word = /^[A-Za-z_0-9.]+/.exec(rest)?.[0];
      const operator = [...OPERATORS, ...MORE].find((each) => rest.startsWith(each));
      if (/^\s/.test(rest)) at += 1;
      else if (word !== undefined) [at, tokens.length] = [at + word.length, tokens.push(word)];
      else if (operator !== undefined) [at, tokens.length] = [at + operator.length, tokens.push(operator)];
      else [at, tokens.length] = [at + 1, tokens.push(rest.charAt(0))];
    }
  }
  return tokens;
}

describe("a shader's spaces, stripped", () => {
  it("drops the spaces round operators and the indentation, keeping one between two names", () => {
    expect(stripGlsl("  vec3 c = vec3( 1.0, 2.0, 3.0 );\n  if ( a <= b && c >= d ) discard;")).toBe(
      " vec3 c=vec3(1.0,2.0,3.0);\nif(a<=b&&c>=d)discard;",
    );
    expect(stripGlsl("uniform float uFade;\nvarying vec3 vTint;")).toBe("uniform float uFade;\nvarying vec3 vTint;");
  });

  it("never joins two signs into another operator: a - -b, a + +b, x--, --x, a - --x, a < = stays apart", () => {
    expect(stripGlsl("float a = b - -c;")).toBe("float a=b- -c;");
    expect(stripGlsl("float a = b + +c;")).toBe("float a=b+ +c;");
    expect(stripGlsl("x-- ;\n-- y;")).toBe("x--;\n--y;");
    expect(stripGlsl("i = j - --k;")).toBe("i=j- --k;");
    expect(stripGlsl("a = b - = c;")).toBe("a=b- =c;");
    expect(stripGlsl("a = b / / c;")).toBe("a=b/ /c;");
    for (const sample of ["float a = b - -c;", "float a = b + +c;", "i = j - --k;", "x = y++ + z;", "w = - -v;"])
      expect(tokensOf(stripGlsl(sample))).toEqual(tokensOf(sample));
  });

  // Code joins a string to what stands beside it, a value set in or another string (three's `'#define ' + name`): its edge is kept as
  // what it was, a line break as one, spaces as one space, none where there was none (7v's security review, F4450).
  it("keeps a string's edges as they were, a line break as one and spaces as one space, none where there was none", () => {
    expect(stripGlsl("\n  float a = 1.0;\n  ")).toBe("\nfloat a=1.0;\n");
    expect(stripGlsl("  = vec4( 1.0 );")).toBe(" =vec4(1.0);");
    expect(stripGlsl("#ifdef USE_MAP\n")).toBe("#ifdef USE_MAP\n");
    expect(stripGlsl("#define ")).toBe("#define ");
    expect(stripGlsl("\n#define HIGH_PRECISION")).toBe("\n#define HIGH_PRECISION");
    expect(stripGlsl("float a = 1.0;")).toBe("float a=1.0;");
    expect(stripGlsl(" \n ")).toBe("\n");
  });

  // Two signs a space keeps apart, for joined they would read as one operator or open or close a comment (7v's review: most of these
  // could go from the code with no test failing).
  it.each([
    "++",
    "--",
    "+=",
    "-=",
    "*=",
    "/=",
    "%=",
    "<<",
    ">>",
    "<=",
    ">=",
    "==",
    "!=",
    "&&",
    "||",
    "^^",
    "&=",
    "|=",
    "^=",
    "//",
    "/*",
    "*/",
  ])("keeps %s's two signs apart where they stood apart", (pair) => {
    const [first, second] = [pair.charAt(0), pair.charAt(1)];
    expect(stripGlsl(`x = y ${first} ${second} z;`)).toBe(`x=y${first} ${second}z;`);
  });

  it("keeps a word apart from a number that starts with its point, drops empty lines, and one space in a preprocessor's line", () => {
    expect(stripGlsl("float x = y .5;")).toBe("float x=y .5;");
    expect(stripGlsl("a = 1.0;\n\n  \nb = 2.0;")).toBe("a=1.0;\nb=2.0;");
    expect(stripGlsl("#define  A   1")).toBe("#define A 1");
  });

  it("keeps each line the preprocessor reads whole, on its own line: #define, #version, #include, #ifdef", () => {
    const glsl =
      "#version 300 es\n  #define PI 3.14159 \nfloat a = PI;\n  #include <common>\n#ifdef USE_MAP\n x = 1.0;\n#endif";
    expect(stripGlsl(glsl)).toBe(
      "#version 300 es\n#define PI 3.14159\nfloat a=PI;\n#include <common>\n#ifdef USE_MAP\nx=1.0;\n#endif",
    );
  });

  it("drops both kinds of comment, whichever starts first, and keeps what stood around them apart", () => {
    expect(stripGlsl("float a = 1.0; // the light\nfloat /* far */ b = a /* and */ + 2.0;")).toBe(
      "float a=1.0;\nfloat b=a+2.0;",
    );
    expect(stripGlsl("float/**/b;")).toBe("float b;");
    expect(stripGlsl("a = 1.0; // x /* y\nb = 2.0; /* z */ c = 3.0;")).toBe("a=1.0;\nb=2.0;c=3.0;");
    expect(stripGlsl("x = -/**/-b;")).toBe("x=- -b;");
    expect(stripGlsl("#define A 1 // one\n#define B 2 /* two */")).toBe("#define A 1\n#define B 2 ");
  });

  it("reads a line break of either kind, and a continued #define as its preprocessor does", () => {
    expect(stripGlsl("float a = 1.0;\r\nfloat b = 2.0;\r\n")).toBe("float a=1.0;\nfloat b=2.0;\n");
    const continued = "#define B(x) \\\n  ( x + 1.0 )\nfloat c = B( 2.0 );";
    expect(tokensOf(stripGlsl(continued))).toEqual(tokensOf(continued));
    expect(stripGlsl(continued)).toContain("\\\n");
  });

  it("strips nothing twice: stripped once is stripped for good", () => {
    const once = stripGlsl(ShaderLib.standard.fragmentShader);
    expect(stripGlsl(once)).toBe(once);
  });

  // Every shader three ships, chunks and programs: the same tokens, in the same order, fewer bytes.
  it("keeps every token of every shader three ships, in order, and leaves them shorter", () => {
    const shaders = [
      ...Object.values(ShaderChunk),
      ...Object.values(ShaderLib).flatMap(({ vertexShader, fragmentShader }) => [vertexShader, fragmentShader]),
    ];
    expect(shaders.length).toBeGreaterThan(150);
    let [before, after] = [0, 0];
    for (const glsl of shaders) {
      const stripped = stripGlsl(glsl);
      expect(tokensOf(stripped)).toEqual(tokensOf(glsl));
      [before, after] = [before + glsl.length, after + stripped.length];
    }
    // 8.6% of their characters on three 0.187, its indentation tabs of one character each: in gzip, the scene's 2,905 B.
    expect(after).toBeLessThan(0.95 * before);
  });

  it("keeps every token of our own shaders, in order", () => {
    const ours = [ORBITING, AIR_VERTEX, AIR_FRAGMENT, FIELD, SEAMS, LOOKUP, NOISE, FORMS, DETAIL, GENERATED_FRAGMENT];
    const shaders = [...ours, RING_VERTEX, RING_FRAGMENT, LIGHT_UNIFORMS, LIGHTS, HALO_VERTEX, HALO_FRAGMENT];
    for (const glsl of [...shaders, TURNED, COMMON, PARTS, SHADE, SURFACE_VERTEX])
      expect(tokensOf(stripGlsl(glsl))).toEqual(tokensOf(glsl));
    const length = (list: readonly string[]) => list.reduce((sum, glsl) => sum + glsl.length, 0);
    expect(length(shaders.map((glsl) => stripGlsl(glsl)))).toBeLessThan(0.95 * length(shaders));
  });
});

describe("a built chunk's shaders, stripped", () => {
  const GLSL = "\nuniform float uFade;\nvoid main() {\n  gl_FragColor = vec4( 1.0 ) * uFade;\n}";

  it("strips a shader in a template, a string, or a template of several parts, and nothing else", () => {
    const code = [
      `const a=\`${GLSL}\`;`,
      `const b=${JSON.stringify(GLSL)};`,
      "const c=`\nvoid main() {\n  ${d} = vec4( 1.0 );\n}`;",
      'const e="a - -b + +c";const f=/a - -b/;const g=`x = y + z`;',
    ].join("\n");
    const stripped = stripChunk(code);
    expect(stripped).toContain(`const a=\`${stripGlsl(GLSL)}\`;`);
    expect(stripped).toContain(`const b=${JSON.stringify(stripGlsl(GLSL))};`);
    // Round a value set in, a space or a line break as there was: a preprocessor line before one stays a line of its own.
    expect(stripped).toContain("const c=`\nvoid main(){\n${d} =vec4(1.0);\n}`;");
    expect(stripped).toContain('const e="a - -b + +c";const f=/a - -b/;const g=`x = y + z`;');
  });

  // Every chunk three ships, as the built scene holds it, a string of its own: 138 of 141 read as GLSL and stripped; three of a light's
  // fields set, with no word only a shader holds, are left as they are, which is safe.
  it("reads three's shader chunks as GLSL but three that hold no word only a shader does, left as they are", () => {
    const chunks = Object.entries(ShaderChunk);
    const code = chunks.map(([name, glsl]) => `const ${name}=${JSON.stringify(glsl)};`).join("\n");
    const stripped = stripChunk(code);
    const left = chunks.filter(([name, glsl]) => stripped.includes(`const ${name}=${JSON.stringify(glsl)};`));
    for (const [name, glsl] of chunks.filter((chunk) => !left.includes(chunk)))
      expect(stripped).toContain(`const ${name}=${JSON.stringify(stripGlsl(glsl))};`);
    expect(left.map(([name]) => name).sort()).toEqual([
      "lights_lambert_fragment",
      "lights_phong_fragment",
      "lights_toon_fragment",
    ]);
  });

  it("reads past letters outside ASCII before a shader, and keeps them", () => {
    const code = `const word="Cosmos · Earth ✦";const a=\`${GLSL}\`;`;
    expect(stripChunk(code)).toBe(`const word="Cosmos · Earth ✦";const a=\`${stripGlsl(GLSL)}\`;`);
  });

  it("leaves a chunk with no shader as it was, to the byte: words a shader uses in prose, a regular expression", () => {
    const code =
      'export const x = "uniform";\nfunction f(a, b) { return a - -b; }\nconst t=`The uniform varying - attribute`;\n';
    expect(stripChunk(code)).toBe(code);
  });

  // `time * ${SPIN}` (surfaceShader.ts): a value set in after a sign keeps its space, for a negative one would make `--`.
  it("keeps a space between a sign and a value set in after it", () => {
    expect(stripChunk("const s=`\nvoid main() { float a = b - ${n}; }`;")).toBe(
      "const s=`\nvoid main(){float a=b- ${n};}`;",
    );
  });

  // Three builds a program's text from strings joined by `+` and `+=` (WebGLProgram.js:170, 319, 396, three 0.187): stripped apart, each
  // lost the edge its neighbour needed, `#defineSTANDARD` and `usampler2DArray;#define HIGH_PRECISION`, and WebGL2 refused every
  // material (7v's security review, F4450).
  it("keeps the edges code joins strings by: a directive on its own line, a define's name a word apart", () => {
    const code = [
      "chunks.push('#define '+name+' '+value);",
      "let p=`precision ${q} float;\nprecision ${q} int;`;p+='\\n#define HIGH_PRECISION';",
      "const v='#version '+version+'\\n';const f=v+'#define varying in\\n'+body;",
    ].join("\n");
    const stripped = stripChunk(code);
    expect(stripped).toContain(`chunks.push("#define "+name+' '+value);`);
    expect(stripped).toContain('let p=`precision ${q} float;\nprecision ${q} int;`;p+="\\n#define HIGH_PRECISION";');
    expect(stripped).toContain(`const v="#version "+version+'\\n';const f=v+"#define varying in\\n"+body;`);
  });

  // What 7v's review's hand-made mutants showed no test held: a value set in beside another, a shader string inside a shader template's
  // value (the outermost is taken, the inner left as it is), an escape in a template.
  it("keeps a space between two values set in, takes the outermost shader, and leaves a template with an escape whole", () => {
    expect(stripChunk("const s=`\nvoid main(){x=${a} ${b};}`;")).toBe("const s=`\nvoid main(){x=${a} ${b};}`;");
    const nested = 'const s=`\nuniform float u;\nvoid main() { ${"uniform vec2 v;  x = 1.0;"} }`;';
    expect(stripChunk(nested)).toBe('const s=`\nuniform float u;\nvoid main(){ ${"uniform vec2 v;  x = 1.0;"} }`;');
    const escaped = "const t=`\nvoid main() { x = 1.0; }\\n`;";
    expect(stripChunk(escaped)).toBe(escaped);
  });

  it.each(["ivec2", "uvec3", "bvec4", "vec2", "mat3", "mat2x3", "sampler2D", "sampler3D", "samplerCube"])(
    "reads a statement beside %s as GLSL",
    (word) => {
      expect(stripChunk(`const s="x  =  1; ${word}";`)).toBe(`const s="x=1;${word}";`);
    },
  );

  it.each(["uniform", "varying", "attribute", "precision", "gl_Position", "void main"])(
    "reads a statement beside %s as GLSL",
    (word) => {
      expect(stripChunk(`const s="x  =  1; ${word}";`)).toBe(`const s="x=1;${word}";`);
    },
  );

  it.each([
    "include",
    "ifdef",
    "ifndef",
    "if",
    "elif",
    "else",
    "endif",
    "define",
    "undef",
    "version",
    "pragma",
    "extension",
  ])("reads a line the preprocessor reads, #%s, as GLSL with no statement", (word) => {
    expect(stripChunk(`const s="#${word} A\\n  b  =  1";`)).toBe(`const s="#${word} A\\nb=1";`);
  });

  it("is a plugin of the build alone, which strips a chunk's shaders and leaves a chunk with none untouched", () => {
    const plugin = glslSpaces(parse);
    expect(plugin.apply).toBe("build");
    const render = (code: string) => plugin.renderChunk(code);
    expect(render(`const a=\`${GLSL}\`;`)?.code).toBe(`const a=\`${stripGlsl(GLSL)}\`;`);
    expect(render("export const x = 1;")).toBeNull();
  });
});
