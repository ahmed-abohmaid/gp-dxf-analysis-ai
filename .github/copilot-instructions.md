# Copilot Instructions — Electrical Load Calculator

This file provides guidance when working with code in this repository.

Review plans thoroughly before making any code changes. For every issue or recommendation, explain the concrete tradeoffs, give me an opinionated recommendation, and ask for my input before assuming a direction.
My engineering preferences (use these to guide your recommendations):

- DRY is important—flag repetition aggressively.
- Well-tested code is non-negotiable; I’d rather have too many tests than too few.
- I want code that’s “engineered enough” — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity).
- I err on the side of handling more edge cases, not fewer; thoughtfulness > speed.
- Bias toward explicit over clever.

1. Architecture review
   Evaluate:

- Overall system design and component boundaries.
- Dependency graph and coupling concerns.
- Data flow patterns and potential bottlenecks.
- Scaling characteristics and single points of failure.
- Security architecture (auth, data access, API boundaries).

2. Code quality review
   Evaluate:

- Code organization and module structure.
- DRY violations—be aggressive here.
- Error handling patterns and missing edge cases (call these out explicitly).
- Technical debt hotspots.
- Areas that are over-engineered or under-engineered relative to my preferences.

3. Test review
   Evaluate:

- Test coverage gaps (unit, integration, e2e).
- Test quality and assertion strength.
- Missing edge case coverage—be thorough.
- Untested failure modes and error paths.

4. Performance review
   Evaluate:
   - N+1 queries and database access patterns.
   - Memory-usage concerns.
   - Caching opportunities.
   - Slow or high-complexity code paths.

   For every specific issue (bug, smell, design concern, or risk):

- Describe the problem concretely, with file and line references.
- Present 2–3 options, including “do nothing” where that’s reasonable.
- For each option, specify: implementation effort, risk, impact on other code, and maintenance burden.
- Give me your recommended option and why, mapped to my preferences above.
- Then explicitly ask whether I agree or want to choose a different direction before proceeding.
  Workflow and interaction
- Do not assume my priorities on timeline or scale.
- After each section, pause and ask for my feedback before moving on.

BEFORE YOU START
Ask if I want one of two options:
1/ BIG CHANGE: Work through this interactively, one section at a time (Architecture → Code Quality → Tests → Performance) with at most 4 top issues in each section.
2/ SMALL CHANGE: Work through interactively ONE question per review section.

FOR EACH STAGE OF REVIEW: output the explanation and pros and cons of each stage’s questions AND your opinionated recommendation and why, and then use AskUserQuestion. Also NUMBER issues and then give LETTERS for options, and when using AskUserQuestion make sure each option clearly labels the issue NUMBER and option LETTER so the user doesn’t get confused. Make the recommended option always the 1st option.

## Architecture

Next.js 16 App Router app that processes AutoCAD DXF files into electrical load estimates per **Saudi Building Code (SBC 401)**.

**Two-phase server pipeline** (`src/server/services/dxf-load.post.ts`):

1. **Geometry** — `processDxfFile()` parses DXF, extracts closed polylines as rooms with areas
2. **AI + RAG** — `classifyRooms()` calls Gemini Flash; SBC 401 context is retrieved from a **Supabase pgvector** store

**Module boundaries** (enforce strictly):

- `src/server/` — server-only; never import in client components
- `src/shared/` — wire types and constants shared across the boundary (`DxfRoom`, `DxfProcessResult`, `MAX_UPLOAD_SIZE_BYTES`)
- `src/features/` — React feature components (`FileUpload`, `ResultsDisplay`)
- `src/hooks/` — TanStack Query wrappers (`useCustomMutation`, `useProcessDxf`)
- `src/components/ui/` — shadcn/ui primitives (new-york style)

## Build and Test

```bash
# Prerequisites
cp .env.example .env        # set NEXT_PUBLIC_GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Run scripts/supabase-setup.sql once in the Supabase SQL Editor
npm run prebuild            # embed SBC 401 PDF into Supabase pgvector (required before dev/build)

npm run dev                 # Next.js dev server
npm run build               # runs prebuild, then next build
npm test                    # vitest watch
npm run test:coverage       # coverage report
npm run lint                # ESLint (0 warnings allowed)
npm run format              # Prettier
```

**Supabase index** is built from `public/saudi-code/Load Estimation for Saudi Code.pdf` into the `documents` table in Supabase pgvector. Pass `--force` to `tsx scripts/build-supabase-index.ts` to rebuild.

## Code Style

- **Prettier**: 100-char width, double quotes, trailing commas, LF. Import order enforced by `@ianvs/prettier-plugin-sort-imports` (builtins → react/next → third-party → `@/features` → `@/components` → `@/lib` → `@/` → relative).
- **TypeScript**: strict mode, `@typescript-eslint/consistent-type-imports` (use `import type`), no floating promises.
- Path alias `@/` maps to `src/`.

## Comments

- **No trivial comments** — never annotate what the code already clearly says (e.g. `// increment counter`, `// return result`). If a comment only restates the code, delete it.
- **JSDoc on exported symbols only** — add `/** … */` JSDoc to exported functions, classes, and types when the purpose, parameters, or return value are not obvious from the signature alone. See `processDxfFile`, `classifyRooms`, and `searchSaudiCode` for examples of when JSDoc earns its place.
- **Inline comments for non-obvious logic** — use `//` comments only to explain _why_ something is done when the reason cannot be inferred from the code: algorithmic choices, SBC 401 rule references, edge-case guards, unit-conversion constants (e.g. `MM_THRESHOLD`, `MM_FACTOR`), and intentional workarounds.
- **Section dividers** — the `// ── Label ──` style dividers used in `processor.ts` and `dxf-load.post.ts` are acceptable to break up long files into logical regions; keep them consistent with the existing style.
- **`@future` tag** — use `// @future: …` (as seen in `vector-store.ts` and `useCustomQuery.ts`) to flag intentionally unused exports or hooks that are scaffolded for upcoming features. Do not remove them silently.

## Project Conventions

- **Hooks wrap TanStack Query**: use `useCustomMutation` / `useCustomQuery` (auto-toast on error/success) — never call `useMutation`/`useQuery` directly. See `src/hooks/useCustomMutation.ts`.
- **Toasts via sileo**: call `pushErrorToast` / `pushSuccessToast` from `src/lib/utils/pushToasters.ts` — never import `sileo` directly.
- **Error normalisation**: always use `normalizeError()` (`src/lib/utils/normalizeError.ts`) before displaying errors.
- **Shared constants**: file size limits live in `src/shared/constants.ts` and are consumed by both the API route and `FileUpload` component.
- **Rooms with failed AI classification** are included in the response with `null` load fields and an `error` string; `hasFailedRooms` flags this on the response.
- `round2()` from `src/lib/utils.ts` is used for all VA load values.

## Testing

Tests mirror `src/` under `tests/` with separate vitest environments:

- `tests/client/**` → `jsdom`
- `tests/server/**` → `node`

Integration tests in `tests/server/integration/` mock `processDxfFile`, `classifyRooms`, `searchSaudiCode` via `vi.mock()`. Unit tests in `tests/server/unit/` mock `dxf-parser` to feed controlled JSON.

## Integration Points

- **Gemini Flash** (`gemini-2.5-flash`) via `@ai-sdk/google` — structured output using `Output.object` + Zod schema (`ClassificationSchema`).
- **Supabase pgvector** via `@langchain/community/vectorstores/supabase` — singleton in `src/server/rag/vector-store.ts`; initialised at startup in `instrumentation.ts`. Similarity threshold of 0.5 applied in `searchSaudiCode()` to filter irrelevant chunks.
- **dxf-parser**, **@flatten-js/core**, **@langchain/community**, **@langchain/google-genai** are `serverExternalPackages` in `next.config.ts` (Node native modules).

## Security

- `NEXT_PUBLIC_GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are all required at server startup; missing keys throw in `instrumentation.ts`.
- File validation (extension, size ≤ 10 MB, non-empty) is enforced on both client (`validateDxfFile`) and server (API route) — use `src/shared/constants.ts` as the single source of truth for limits.
