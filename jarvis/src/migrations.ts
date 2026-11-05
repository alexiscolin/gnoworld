// jarvis's migrations, on its own file (D45), in the order they ran: as the server's (server/src/migrations.ts), a
// file is at `user_version` N once its first N have run, so an entry is never edited, moved or inserted, only
// appended. migrations.test.ts holds each one's SHA-256.
import { BUDGET_CAPS, BUDGET_TABLES } from "./budget.ts";
import { CACHE_TABLES } from "./cache.ts";

export const jarvisMigrations: readonly string[] = [BUDGET_TABLES, BUDGET_CAPS, CACHE_TABLES];
