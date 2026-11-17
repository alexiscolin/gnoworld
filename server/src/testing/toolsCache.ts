// The tools' cache the tests' pinned binaries live in (scripts/ergo.sh builds Ergo there): GNOWORLD_TOOLS, else ~/.cache/gnoworld-tools;
// empty is unset, as ergo.sh, check_nginx.py and workshop.sh read it (F13755).
import { homedir } from "node:os";
import { join } from "node:path";

export function toolsCache(env: Record<string, string | undefined> = process.env): string {
  const tools = env["GNOWORLD_TOOLS"];
  return tools === undefined || tools === "" ? join(homedir(), ".cache/gnoworld-tools") : tools;
}
