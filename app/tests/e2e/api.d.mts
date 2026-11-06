import type { IncomingMessage, ServerResponse } from "node:http";

export function relay(port: number, incoming: IncomingMessage, outgoing: ServerResponse): void;
