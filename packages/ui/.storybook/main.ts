// Storybook shows every token and every component (docs/DESIGN-SYSTEM.md, "Storybook shows everything").
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  // The app's failure views are drawn here too, apart from the scene that may be what failed.
  stories: ["../src/**/*.stories.tsx", "../../../app/src/features/errors/*.stories.tsx"],
  // Storybook reports nothing home: the sandbox and the CI reach only the registries.
  core: { disableTelemetry: true },
};

export default config;
