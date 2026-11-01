// The web image's nginx.conf served by the pinned nginx (scripts/check_nginx.py's way: the image's paths and ports put where a
// plain run can use them, the password and the upstream hosts left out), for a test that asks it a question and reads the answer.
// A missing or unpinned binary is a failure, never a skip.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const VERSION = "1.30.6";
const ROOT = new URL("../../", import.meta.url).pathname;

export interface Nginx {
  /** Where the file served at /markets.json lives. */
  markets: string;
  /** A file outside the markets folder, readable by nginx: what a link planted in the volume would point at. */
  outside: string;
  /** A GET with no password and no PROXY header, as the staged config takes it. */
  get(path: string): Promise<{ status: number; headers: Headers; body: string }>;
  stop(): void;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (typeof address === "object" && address !== null) resolve(address.port);
        else reject(new Error("no port"));
      });
    });
  });

function binary(): { exe: string; mime: string } {
  const tools = process.env["GNOWORLD_TOOLS"] ?? join(homedir(), ".cache", "gnoworld-tools");
  const exe = join(tools, `nginx-${VERSION}`, "nginx");
  const mime = join(tools, `nginx-${VERSION}`, "conf", "mime.types");
  const pinned = readFileSync(join(ROOT, "scripts", "nginx.sha256"), "utf8").split(/\s+/)[0];
  const actual = createHash("sha256").update(readFileSync(exe)).digest("hex");
  if (actual !== pinned)
    throw new Error(`${exe} is not the pinned nginx ${VERSION} (docs/DEVELOPMENT.md, "The pinned nginx")`);
  return { exe, mime };
}

// The image's config with its filesystem and network put in `where`; a line it cannot find is a failure, as in check_nginx.py.
function staged(where: string, ports: [number, number]): string {
  let conf = readFileSync(join(ROOT, "deploy", "web", "nginx.conf"), "utf8");
  const once = (pattern: RegExp, to: string) => {
    if (!pattern.test(conf))
      throw new Error(`deploy/web/nginx.conf has no line ${String(pattern)}: this staging must follow it`);
    conf = conf.replace(pattern, () => to);
  };
  once(/^\s*include\s+\/etc\/nginx\/mime\.types;/m, `include ${binary().mime};`);
  once(/^\s*include\s+\/etc\/nginx\/csp\.conf;/m, `include ${join(where, "csp.conf")};`);
  once(/^\s*root\s+\/usr\/share\/nginx\/html;/m, `root ${join(where, "html")};`);
  once(/^\s*root\s+\/markets;/m, `root ${join(where, "markets")};`);
  once(/^\s*listen\s+8080\s+proxy_protocol;/m, `listen 127.0.0.1:${String(ports[0])};`);
  once(/^\s*listen\s+127\.0\.0\.1:8081;/m, `listen 127.0.0.1:${String(ports[1])};`);
  conf = conf.replace(/^\s*auth_basic(_user_file)?\s+[^;]*;\n/gm, "");
  conf = conf.replace(/^(\s*pid\s+)\S+;/m, (_, head: string) => `${head}${where}/nginx.pid;`);
  conf = conf.replace(/^(\s*(?:error|access)_log\s+)\/dev\/std\w+/gm, (_, head: string) => `${head}${where}/nginx.log`);
  conf = conf.replace(/(\s)\/tmp\/(\w+_temp)\b/g, (_, space: string, name: string) => `${space}${where}/${name}`);
  return conf.replace(/(proxy_pass\s+https?:\/\/)[A-Za-z][\w.-]*(:\d+;)/g, "$1127.0.0.1$2");
}

/** Starts the pinned nginx on the image's config, with an empty folder for markets.json; `stop` ends it. */
export async function serveImage(): Promise<Nginx> {
  const { exe } = binary();
  const where = mkdtempSync(join(tmpdir(), "nginx-test."));
  mkdirSync(join(where, "html"));
  mkdirSync(join(where, "markets"));
  writeFileSync(join(where, "html", "__spa-fallback.html"), "<!doctype html><title>fallback</title>");
  writeFileSync(
    join(where, "csp.conf"),
    "map_hash_max_size 2048;\nmap_hash_bucket_size 256;\nmap $uri $csp {\n    default \"default-src 'none'\";\n}\n",
  );
  const ports: [number, number] = [await freePort(), await freePort()];
  const conf = join(where, "nginx.conf");
  writeFileSync(conf, staged(where, ports));
  const flags = ["-c", conf, "-p", `${where}/`, "-e", join(where, "error.log")];
  const check = spawnSync(exe, ["-t", ...flags], { encoding: "utf8" });
  if (check.status !== 0) throw new Error(`nginx -t refused the staged config: ${check.stdout}${check.stderr}`);
  const child: ChildProcess = spawn(exe, [...flags, "-g", "daemon off;"], { stdio: "ignore" });
  const stop = () => {
    child.kill("SIGTERM");
    rmSync(where, { recursive: true, force: true });
  };
  const get: Nginx["get"] = async (path) => {
    const response = await fetch(`http://127.0.0.1:${String(ports[0])}${path}`);
    return { status: response.status, headers: response.headers, body: await response.text() };
  };
  for (let tries = 0; tries < 100; tries += 1) {
    try {
      await get("/");
      return { markets: join(where, "markets", "markets.json"), outside: join(where, "secret"), get, stop };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  stop();
  throw new Error("nginx did not answer in 10 s");
}
