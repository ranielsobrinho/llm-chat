# LLM Chat

A small React and TypeScript chat UI in a pnpm/Turborepo monorepo. The current milestone is frontend-only: messages stay in browser memory, and no API request is made.

## Getting started

```bash
pnpm install
pnpm dev
```

Open the Vite URL shown in the terminal. To run only the web app, use `pnpm dev:web`.

## Workspace commands

- `pnpm build` builds the web app.
- `pnpm check-types` checks TypeScript types.

## Learning path

The next step is to add a Node.js backend and learn the request validation, configuration, error handling, and OpenAI integration there. The eventual model target is `gpt-6-luna`; API credentials belong on the backend, never in this frontend.
