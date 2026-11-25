# RanGPT

RanGPT is a streaming AI chat app built with React, TypeScript, Fastify, MongoDB, and OpenAI's Responses API. It is organized as a pnpm and Turborepo monorepo.

## Preview

[![RanGPT chat interface — click to watch the demo](assets/rangpt.png)](assets/rangpt.mp4)

[▶ Watch the RanGPT demo video](assets/rangpt.mp4)

## How it works

1. The browser sends requests to the Fastify API with an anonymous session token.
2. The API hashes that token, scopes conversation reads and writes to it, and stores history in MongoDB.
3. The API sends the conversation context to OpenAI's Responses API using `gpt-6-luna`, then forwards generated text as NDJSON events.
4. The frontend reads those events and updates the response as chunks arrive. The API key stays on the server.

The browser token is a bearer credential stored in local storage. Clearing browser storage loses access to that browser's conversations. The app has no account recovery or cross-device sync. The light or dark appearance preference is also stored in local storage.

## Architecture

[Open the interactive architecture diagram](.archify/architecture-rangpt-chat-20261125-architecture/rangpt-chat-architecture.html).

## Security

- Helmet security headers and an explicit CORS origin allowlist.
- API rate limits: 100 requests per 15 minutes per IP, with `/chat` limited to 10 per minute.
- Request bodies are limited to 16 KB; chat messages are limited to 4,000 characters.
- Conversation ownership is checked on every history operation; only a SHA-256 hash of the anonymous session token is stored.
- Each conversation retains up to 100 messages, and the latest 40 messages are sent as model context.
- Model instructions treat user content as untrusted and the model is not given tools. This is a prompt-injection mitigation, not a guarantee that model output is safe or correct.

The rate limiter uses in-memory counters. If you deploy multiple API instances, configure a shared rate-limit store such as Redis. Apply HTTPS at the hosting layer.

## Project structure

```text
apps/
  api/    Fastify API, OpenAI integration, and request validation
  web/    React, TypeScript, Vite, and Tailwind CSS frontend
```

## Requirements

- Node.js 20 or newer
- pnpm 10 (the repository pins pnpm 10.18.3)
- An OpenAI API key with access to the configured model
- A MongoDB instance (local MongoDB or MongoDB Atlas)

## Run locally

Install dependencies from the repository root:

```bash
pnpm install
```

Create environment files from the examples:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set `OPENAI_API_KEY` and `MONGODB_URI` in `apps/api/.env`. `MONGODB_DB` defaults to `rangpt`. The API listens on `http://127.0.0.1:5000` by default. `WEB_ORIGINS` is a comma-separated allowlist; keep it aligned with the frontend's local origin (`http://127.0.0.1:5173` or `http://localhost:5173`). `VITE_API_URL` in `apps/web/.env` should point to the API origin. Environment files are ignored by Git; do not put the API key in a `VITE_` variable.

Start both apps in development mode:

```bash
pnpm dev
```

Then open `http://127.0.0.1:5173`. You can also run either app on its own with `pnpm --filter api dev` or `pnpm dev:web`. The API health endpoint is `GET /health`.

## Streaming response format

Create a conversation with `POST /conversations`, then send `POST /chat` a body such as `{"conversationId":"<id>","message":"Why is the sky blue?"}`. Include an `X-Session-Token` UUID header on both requests. The chat response is NDJSON, with one JSON event per line:

```json
{"type":"delta","text":"Because..."}
{"type":"delta","text":"the atmosphere..."}
{"type":"done"}
```

A stream error is returned as an `error` event. To inspect the stream from a terminal, run:

```bash
curl -N http://127.0.0.1:5000/chat \
  -H 'Content-Type: application/json' \
  -H 'X-Session-Token: 9e99d1d8-911a-411a-849a-2f839930fefa' \
  -d '{"conversationId":"<conversation-id>","message":"Say hello in one sentence."}'
```

## Workspace commands

Run these from the repository root:

```bash
pnpm dev           # Run the frontend and API
pnpm build         # Build both apps
pnpm check-types   # Type-check both apps
pnpm test          # Run API integration tests with Vitest
pnpm lint          # Check formatting and lint rules with Biome
pnpm format        # Apply Biome formatting and safe fixes
```

Husky runs `pnpm lint` before each commit. The code is intentionally small and is meant to be extended while learning API design, validation, streaming, error handling, and server-side secret management.

## License

This project is licensed under the [MIT License](LICENSE).
