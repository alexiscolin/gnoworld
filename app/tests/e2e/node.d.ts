// Node's file reading, whose types this folder leaves out (fixtures.ts): the CSP journey reads the build.
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
}
