# @gnoworld/ui

The design system: tokens, base styles, components and layout compositions, with Storybook to browse them. It is React and CSS only and knows nothing of the app's features or store.

## What is in it

- `src/tokens.css`, `src/TokensPage/tokens.ts`: the design tokens (colours, sizes and so on), with tests that check them.
- `src/reset.css`, `src/base.css`, `src/layers.css`, `src/utilities.css`, `src/styles.css`: the base styles and cascade layers. The package exports `./styles.css` and `./layers.css`.
- `src/<Component>/`: one folder per component (`Button/`, `Dialog/`, `Tabs/`, `Planet/` and so on), each with its CSS module, stories and tests.
- `src/compositions/`: layout building blocks (`Center`, `Cluster`, `Grid`, `Sidebar`).
- `src/icons/`: the icons.
- `src/fonts.ts`: loads the fonts (Geist and Geist Mono); exported as `./fonts`.
- `.storybook/`: the Storybook configuration.

## Use

```ts
import "@gnoworld/ui/styles.css";
import { /* ... */ } from "@gnoworld/ui";
```

Import the styles once, and the components from the package root. Fonts are loaded by `@gnoworld/ui/fonts`.

## Build, test and run

From the repository root, with the Node version in `.node-version`:

```bash
pnpm run test        # includes the ui project
pnpm run typecheck   # includes packages/ui/tsconfig.json
pnpm run lint
pnpm --filter @gnoworld/ui storybook         # Storybook on port 6006
pnpm --filter @gnoworld/ui build-storybook   # static Storybook build
```

There is no other build step: the app imports the sources directly. Setup is in [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).

## Rules

- `ui` imports only `ui`, never `features`, `space`, `store` or `lib`. See "Which way dependencies point" in [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
- Colours and sizes come from the tokens. The look is described in [docs/DESIGN-SYSTEM.md](../../docs/DESIGN-SYSTEM.md).
- General TypeScript and React rules: [.claude/rules/typescript.md](../../.claude/rules/typescript.md).
