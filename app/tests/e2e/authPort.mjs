// Loaded into the server the journeys start (node --import). main.ts serves Ergo's auth script on a Unix socket
// (AUTH_SOCKET), which Claude Code's sandbox refuses to bind: the one listen on that path goes to a loopback port
// instead, the one Ergo's script is told to dial (server/src/testing/ergo.ts, authScript.forward). Nothing else in
// main.ts, which is the file production runs, changes.
import { Server } from "node:net";

const { AUTH_SOCKET, E2E_AUTH_PORT } = process.env;
const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  return args[0] === AUTH_SOCKET ? listen.call(this, Number(E2E_AUTH_PORT), "127.0.0.1") : listen.apply(this, args);
};
