// What the recording server (app/recording/serve.mjs) checks before it writes the recorded answers to a file: the
// request comes from its own page on this machine, and is not big. Pure, so a test runs it; the server only wires it.

/** The most a save may hold: a recording is a few kilobytes. */
export const MAX_SAVE_BYTES = 1_048_576;

/** 403 unless Origin and Host both name this server, `localhost` or `127.0.0.1` with its port; else undefined. */
export function saveRefusal(origin: string | undefined, host: string | undefined, port: number): 403 | undefined {
  const names = [`localhost:${String(port)}`, `127.0.0.1:${String(port)}`];
  const own = origin !== undefined && names.some((name) => origin === `http://${name}`);
  return own && host !== undefined && names.includes(host) ? undefined : 403;
}

/** 413 when a body is past the cap, else undefined. */
export const saveTooBig = (bytes: number): 413 | undefined => (bytes > MAX_SAVE_BYTES ? 413 : undefined);
