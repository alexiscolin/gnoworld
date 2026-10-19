// Every story wears the design system's tokens, base and fonts, as the app does.
import type { Preview } from "@storybook/react-vite";
import "../src/styles.css";

const preview: Preview = {
  parameters: { layout: "padded" },
};

export default preview;
