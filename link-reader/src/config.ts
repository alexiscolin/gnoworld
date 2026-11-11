// The reader's settings from its environment: LINKS_LISTEN (host:port, required), LINKS_MAX (1 to 16, default 2), LINKS_PROXY (host:port of the
// link way out), which only LINKS_DIRECT=1 (development) may leave out: in production an unset proxy is refused, never a silent open way out.

export interface Settings {
  host: string;
  port: number;
  proxy: string | undefined;
  max: number;
}

const bad = (name: string) => new Error(`${name} is not valid`);
const hostPort = /^([^:/\s]+):([0-9]{1,5})$/;

function listenOf(value: string | undefined): { host: string; port: number } {
  const found = hostPort.exec(value ?? "");
  const port = Number(found?.[2]);
  if (found === null || port < 1 || port > 65_535) throw bad("LINKS_LISTEN");
  return { host: found[1] ?? "", port };
}
function maxOf(value: string | undefined): number {
  const max = value === undefined ? 2 : /^[0-9]{1,2}$/.test(value) ? Number(value) : 0;
  if (max < 1 || max > 16) throw bad("LINKS_MAX");
  return max;
}
// No proxy only for development (LINKS_DIRECT=1), and then no proxy at all.
function proxyOf(proxy: string | undefined, direct: boolean): string | undefined {
  const set = proxy !== undefined && proxy !== "";
  if (set === direct) throw bad(set ? "LINKS_DIRECT" : "LINKS_PROXY");
  if (set && !hostPort.test(proxy)) throw bad("LINKS_PROXY");
  return set ? proxy : undefined;
}

/** The settings, or a thrown Error naming the setting (never its value). */
export function readSettings(env: Record<string, string | undefined>): Settings {
  return {
    ...listenOf(env["LINKS_LISTEN"]),
    proxy: proxyOf(env["LINKS_PROXY"], env["LINKS_DIRECT"] === "1"),
    max: maxOf(env["LINKS_MAX"]),
  };
}
