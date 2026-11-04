// Node's file reading, whose types this folder leaves out (fixtures.ts): the CSP and tuning journeys read the build.
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
  export function readdirSync(path: URL, options: { recursive: true }): string[];
}
