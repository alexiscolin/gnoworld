// The admin API's app, for main: Jarvis's admin routes and the console's login on a Hono of their own, never the public one.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import type { Log } from "@gnoworld/service/log";
import { makeApp } from "./app.ts";
import type { Config } from "./config.ts";
import { adminRoutes } from "./door/admin.ts";
import type { Jarvis } from "./door/jarvis.ts";
import type { Quota } from "./door/quota.ts";
import { makeLogin, makeSigned } from "./login/login.ts";
import { loginFrom } from "./login/routes.ts";
import { isTeam, type Roles } from "./roles/roles.ts";

interface Parts {
  db: DatabaseSync;
  config: Config;
  roles: Roles;
  door: { quota: Quota; jarvis: Jarvis } | undefined;
  log: Log;
  ready: () => boolean;
}

/** The admin app: routes only with ADMIN_PORT's settings, Jarvis's only with a door. */
export function adminBoot({ db, config, roles, door, log, ready }: Parts): Hono {
  const app = makeApp(log, ready);
  if (config.admin === undefined) return app;
  app.route("/api/login", loginFrom(db, { ...config, origins: config.admin.origins }, { log, console: true }));
  if (door !== undefined)
    app.route(
      "/api/admin/jarvis",
      adminRoutes({
        isTeam: (who) => isTeam(roles, who),
        // The console's session, an hour from its signature, whatever login made it (ADR-0002 §6).
        session: makeLogin(db, { chains: config.chains, now: Date.now, console: true }).session,
        origins: config.admin.origins,
        signed: makeSigned(db, { chains: config.chains, now: Date.now, console: true }),
        quota: door.quota,
        jarvis: door.jarvis,
        log,
        now: Date.now,
      }),
    );
  return app;
}
