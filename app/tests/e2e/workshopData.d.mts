import type { IncomingMessage, ServerResponse } from "node:http";

export function workshopDataFiles(
  dir: string,
): (req: Pick<IncomingMessage, "url" | "method">, res: ServerResponse, next: () => void) => void;
