import type { Config } from "@react-router/dev/config";
import { worldPath, WORLDS } from "./src/worlds.ts";

// No rendering server in production (ADR-0002 §2): one HTML file per place, built ahead.
export default {
  appDirectory: "src",
  ssr: false,
  prerender: ["/", ...WORLDS.map(worldPath)],
} satisfies Config;
