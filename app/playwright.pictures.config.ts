import { defineConfig } from "@playwright/test";
import base from "./playwright.config.ts";

// The chat's planet pictures are taken by tests/tools, a folder the gate's journeys (testDir tests/e2e) never walk: run it with this config
// (pictureInputs.ts, RERUN). Same test build, same software GPU, as the journeys.
export default defineConfig({ ...base, testDir: "tests/tools" });
