# Personal Assistant Messenger

A messaging app (iMessage-style) where each "contact" is a specialized AI assistant with its own persistent memory and conversation history.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/messenger run dev` — run the React frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `OPENAI_API_KEY` — user's own OpenAI API key (set in Replit Secrets)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS v4, shadcn/ui, wouter, TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- AI: OpenAI SDK (`gpt-4o-mini`) — direct key, NOT Replit AI proxy
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for API contract
- `lib/db/src/schema/` — Drizzle schema (`assistants.ts`, `assistant-messages.ts`)
- `artifacts/api-server/src/routes/assistants.ts` — CRUD + pin/archive/duplicate/search/clear
- `artifacts/api-server/src/routes/openai.ts` — SSE text chat + voice chat routes
- `artifacts/messenger/src/pages/` — React pages (chat-list, chat-screen, create/edit-assistant)

## Architecture decisions

- **Direct OpenAI key**: User provides `OPENAI_API_KEY` in Replit Secrets. The `lib/integrations-openai-ai-server` clients were patched to fall back to `OPENAI_API_KEY` when the Replit proxy vars aren't set.
- **SSE streaming**: Chat responses stream token-by-token via Server-Sent Events. The client reads the raw response body with a `ReadableStream` reader.
- **Contract-first API**: OpenAPI spec → Orval codegen → typed React Query hooks used throughout the frontend.
- **Markdown rendering**: AI responses render via `react-markdown` + `@tailwindcss/typography` for rich formatting.

## Product

- Chat list showing all assistants (iMessage style) with pinned assistants at top
- Real-time streaming chat with each AI assistant
- Voice recording → speech-to-text → AI response
- Create assistants with custom name, emoji avatar, and system instructions
- Pin, edit, duplicate, delete assistants; clear conversation history
- Search across assistants and messages

## User preferences

_Populate as needed._

## Gotchas

- **Do NOT** import from `lib/integrations-openai-ai-server` clients without ensuring `OPENAI_API_KEY` is set — both `audio/client.ts` and `image/client.ts` throw at module load time if no key is found.
- The `assistants.ts` route uses `lastMessageAt` and `lastMessagePreview` computed via a subquery — these come from `assistant-messages` table.
- Voice endpoint transcribes with `gpt-4o-mini-transcribe`, then runs a normal chat completion — it does NOT return audio back.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
