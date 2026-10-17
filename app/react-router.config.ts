import type { Config } from "@react-router/dev/config";
import { WORLDS } from "./src/site.ts";

// No rendering server in production (ADR-0002 §2): one HTML file per place, built ahead.
export default {
  appDirectory: "src",
  ssr: false,
  prerender: ["/", ...WORLDS.map((world) => `/w/${world.slug}`)],
} satisfies Config;
