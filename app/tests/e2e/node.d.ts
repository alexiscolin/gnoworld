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
// Node's HTTP, as little as relay.spec.ts uses: two servers and a client that goes away.
declare module "node:http" {
  export interface IncomingMessage {
    on: (event: "close", listener: () => void) => void;
  }
  export interface ServerResponse {
    on: (event: "close", listener: () => void) => void;
    writeHead: (status: number) => ServerResponse;
    write: (chunk: string) => boolean;
  }
  export interface Server {
    listen: (port: number, host: string, done: () => void) => void;
    address: () => { port: number };
    closeAllConnections: () => void;
    close: () => void;
  }
  export function createServer(handler: (incoming: IncomingMessage, outgoing: ServerResponse) => void): Server;
  export function get(
    url: string,
    answered: () => void,
  ): { on: (event: "error", listener: () => void) => void; destroy: () => void };
}
