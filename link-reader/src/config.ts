// The reader's settings from its environment: LINKS_LISTEN (host:port, required), LINKS_MAX (1 to 16, default 2), LINKS_PROXY (host:port of the
// link way out), which only LINKS_DIRECT=1 (development) may leave out: in production an unset proxy is refused, never a silent open way out.
import { z } from "zod";
import { hostPort, parseSettings, whole } from "@gnoworld/service/settings";

export interface Settings {
  host: string;
  port: number;
  proxy: { host: string; port: number } | undefined;
  max: number;
}

/** The settings, or a thrown Error naming the setting and its fault (never its value). */
export function readSettings(env: Record<string, string | undefined>): Settings {
  const Env = z
    .object({
      LINKS_LISTEN: hostPort(),
      LINKS_MAX: whole(16, 2),
      // An empty proxy is none.
      LINKS_PROXY: z
        .string()
        .optional()
        .transform((text) => (text === "" ? undefined : text))
        .pipe(hostPort().optional()),
      LINKS_DIRECT: z.string().optional(),
    })
    .superRefine(({ LINKS_PROXY, LINKS_DIRECT }, ctx) => {
      // No proxy only for development (LINKS_DIRECT=1), and then no proxy at all.
      const direct = LINKS_DIRECT === "1";
      if ((LINKS_PROXY !== undefined) === direct)
        ctx.addIssue({ code: "custom", path: [direct ? "LINKS_DIRECT" : "LINKS_PROXY"] });
    });
  const settings = parseSettings(Env, env);
  return { ...settings.LINKS_LISTEN, proxy: settings.LINKS_PROXY, max: settings.LINKS_MAX };
}
