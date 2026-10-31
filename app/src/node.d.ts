// The little of Node the build's config, the data files' loader and their tests use: the app's tsconfig leaves
// @types/node out (as tests/e2e/node.d.ts), so each module declares its own handful.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readFileSync(path: string): Uint8Array;
  export function readdirSync(path: string, options: { recursive: true }): string[];
  export function statSync(path: string): { size: number };
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive: true }): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options: { recursive?: true; force?: true }): void;
  export function cpSync(from: string, to: string, options?: { recursive: true }): void;
  export function symlinkSync(target: string, path: string): void;
  export function writeFileSync(path: string, data: string): void;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
}
declare module "node:os" {
  export function tmpdir(): string;
  export function homedir(): string;
}
declare module "node:child_process" {
  export interface ChildProcess {
    kill(signal: "SIGTERM"): boolean;
  }
  export function spawnSync(
    command: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string | undefined>; encoding: "utf8" },
  ): { status: number | null; stdout: string; stderr: string };
  export function spawn(command: string, args: string[], options: { stdio: "ignore" }): ChildProcess;
}
declare module "node:crypto" {
  export function createHash(algorithm: "sha256"): {
    update(data: Uint8Array): { digest(encoding: "hex"): string };
  };
}
declare module "node:net" {
  export function createServer(): {
    once(event: "error", listener: (error: Error) => void): void;
    listen(port: number, host: string, listener: () => void): void;
    address(): { port: number } | string | null;
    close(listener: () => void): void;
  };
}
declare const process: { execPath: string; env: Record<string, string | undefined> };
