// The journeys' hosts (serve.mjs): E2E_PORT's base, 4173 when unset, and the next two. check.sh picks a
// free base for each run, so the gates of several worktrees run at once.
declare const process: { env: Record<string, string | undefined> };

const port = Number(process.env["E2E_PORT"] ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65533)
  throw new Error(`E2E_PORT is no port base: ${String(process.env["E2E_PORT"])}`);
const at = (offset: number) => `http://127.0.0.1:${String(port + offset)}`;

/** The site as the demo's host serves it. */
export const SITE = at(0);
/** The same build, whose worker a POST to /__bump makes a new version. */
export const UPDATING = at(1);
/** The updating host behind the demo's shared password. */
export const GUARDED = at(2);
/** The build the journeys serve (serve.mjs): app/build, or GNOWORLD_BUILD, an absolute folder (react-router.config.ts). */
export const BUILD =
  process.env["GNOWORLD_BUILD"] === undefined
    ? new URL("../../build/", import.meta.url)
    : new URL(`file://${process.env["GNOWORLD_BUILD"]}/`);
