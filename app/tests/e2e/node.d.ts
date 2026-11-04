// Node's file reading, whose types this folder leaves out (fixtures.ts): the CSP and tuning journeys read the build, and chunks.ts weighs it.
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
  export function readdirSync(path: URL, options: { recursive: true }): string[];
  export function readdirSync(path: string): string[];
}
declare module "node:url" {
  export function fileURLToPath(url: URL): string;
}
declare module "node:zlib" {
  export function gzipSync(data: Uint8Array): Uint8Array;
}
