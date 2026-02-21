# Electrical Load Calculator — Project Methodology

## Overview

A **Next.js 16 App Router** web application that accepts AutoCAD DXF floor-plan files and produces
per-room electrical load estimates compliant with the **Saudi Building Code (SBC 401)**. The system
combines deterministic geometry processing with AI-assisted classification and a RAG pipeline backed
by the full SBC 401 electrical code text.

---

## Architecture

```
Browser (React 19)
    │  multipart/form-data (DXF file)
    ▼
POST /api/dxf  (Next.js Route Handler)
    │
    ├─ Phase 1 — Geometry  →  processDxfFile()
    │       dxf-parser  →  @flatten-js/core
    │       Extracts closed polylines → room polygons + areas (m²)
    │
    └─ Phase 2 — AI + RAG  →  classifyRooms()
            searchSaudiCode()   →  Supabase pgvector
                                    (gemini-embedding-001)
            generateText()      →  Gemini Flash (gemini-2.5-flash)
                                    structured output via Zod schema
```

### Module Boundaries

| Layer                | Path                 | Rule                                               |
| -------------------- | -------------------- | -------------------------------------------------- |
| Server-only          | `src/server/`        | Never imported by client components                |
| Shared wire types    | `src/shared/`        | Used by both client and server                     |
| React features       | `src/features/`      | Client components only                             |
| TanStack Query hooks | `src/hooks/`         | Always wrap `useCustomMutation` / `useCustomQuery` |
| shadcn/ui primitives | `src/components/ui/` | New-york style                                     |

---

## Packages & Usage

### Runtime Dependencies

| Package                                                | Usage                                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `next@16`                                              | App Router framework; API route handler at `src/app/api/dxf/route.ts`                                          |
| `react@19` / `react-dom@19`                            | UI runtime                                                                                                     |
| `@ai-sdk/google` + `ai`                                | `generateText()` with `Output.object()` for structured Gemini output                                           |
| `@langchain/community`                                 | `SupabaseVectorStore` — queries the Supabase pgvector store; `PDFLoader` — loads SBC 401 PDF during `prebuild` |
| `@langchain/google-genai`                              | `GoogleGenerativeAIEmbeddings` (`gemini-embedding-001`) — used at index build time and similarity search       |
| `@supabase/supabase-js`                                | Supabase client — connects to the pgvector store for document storage and retrieval                            |
| `@langchain/textsplitters`                             | `RecursiveCharacterTextSplitter` — chunks SBC 401 text into 1 000-char overlapping segments during `prebuild`  |
| `@langchain/core`                                      | LangChain document types shared across LangChain integrations                                                  |
| `dxf-parser`                                           | Parses raw DXF text into a structured entity tree                                                              |
| `@flatten-js/core`                                     | Polygon area computation and point-in-polygon test for room label matching                                     |
| `@tanstack/react-query@5`                              | Server-state management; wrapped by `useCustomMutation` / `useCustomQuery`                                     |
| `zod@4`                                                | `ClassificationSchema` for Gemini structured output; API input validation                                      |
| `sileo`                                                | Toast notification system (consumed via `pushErrorToast` / `pushSuccessToast`)                                 |
| `lucide-react`                                         | Icon set used throughout the UI                                                                                |
| `radix-ui` + shadcn components                         | Accessible UI primitives (Card, Button, Badge, Table, etc.)                                                    |
| `class-variance-authority` + `clsx` + `tailwind-merge` | Conditional class name utilities                                                                               |
| `tw-animate-css`                                       | Tailwind CSS animation utilities                                                                               |

### Development Dependencies

| Package                                                    | Usage                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `vitest` + `@vitest/coverage-v8`                           | Test runner and coverage (jsdom for client tests, node for server tests) |
| `@testing-library/react` + `@testing-library/user-event`   | React component testing                                                  |
| `@testing-library/jest-dom`                                | DOM assertion matchers                                                   |
| `jsdom`                                                    | Browser environment emulation for client-side unit tests                 |
| `tsx`                                                      | Runs `scripts/build-supabase-index.ts` during `prebuild`                 |
| `dotenv`                                                   | Loads `NEXT_PUBLIC_GEMINI_API_KEY` in the prebuild script                |
| `eslint@9` + `eslint-config-next` + `@typescript-eslint/*` | Linting (zero warnings allowed)                                          |
| `prettier@3` + `@ianvs/prettier-plugin-sort-imports`       | Formatting and import order enforcement                                  |
| `@tailwindcss/postcss`                                     | Tailwind v4 PostCSS integration                                          |

---

## Detailed Scenario Flows

### Scenario 1 — Happy Path (Successful DXF Processing)

A user uploads a valid DXF floor plan with recognisable room polylines and text labels.

```
[Browser]
  User drags/selects a .dxf file
        │
        ▼
  FileUpload.tsx — validateDxfFile()
        ├─ Extension check: must end in .dxf
        ├─ Size check: ≤ MAX_UPLOAD_SIZE_BYTES (10 MB)
        └─ Non-empty check
        │  PASS
        ▼
  useProcessDxf() → useCustomMutation()
        │  POST multipart/form-data to /api/dxf
        ▼

[Server — POST /api/dxf]
  ── Phase 1: Geometry ───────────────────────────────
  processDxfFile(content)
    │
    ├─ dxf-parser.parseSync()  →  entity tree
    ├─ Filter closed LWPOLYLINE / POLYLINE entities
    ├─ Build Flatten.Polygon for each polyline
    ├─ Compute sample areas → detect mm vs m units
    │       If avg area > 500 000 → divide by 1 000 000 (mm² → m²)
    ├─ Discard polygons < 0.2 m² (annotations/blocks)
    ├─ Collect TEXT / MTEXT entities
    ├─ Point-in-polygon test → assign text label to each room polygon
    └─ Return DxfGeometryResult { rawRooms: RawRoom[], unitsDetected, ... }

  ── Phase 2: RAG ────────────────────────────────────
  searchSaudiCode(query, topK=6)
    │
    ├─ Check in-memory FIFO cache (key = query::topK)
    │       HIT  → return cached docs immediately
    │       MISS ↓
    ├─ getVectorStore()  →  SupabaseVectorStore singleton
    ├─ store.similaritySearchWithScore(query, topK)
    │       Embeds query with gemini-embedding-001
    │       Calls match_documents() RPC in Supabase pgvector
    │       Filters out chunks below similarity threshold (0.5)
    └─ Cache result, return { content, source }[]

  ── Phase 3: AI Classification ──────────────────────
  Deduplicate rooms by uppercased name
  buildClassificationPrompt(uniqueRooms, codeContext)
    │  Builds prompt with room labels + areas + SBC 401 context
    ▼
  generateText({ model: geminiFlash, output: Output.object(ClassificationSchema) })
    │  Returns structured JSON:
    │    { roomLabel, roomType, lightingLoad, socketsLoad, totalLoad, codeReference }
    │    per room
    ▼
  Merge AI results back onto ALL rawRooms (including duplicates)
  round2() applied to all VA values
  Compute totalLoad (sum of rooms where AI succeeded)
  Set hasFailedRooms = true if any room lacks AI output

[Server → Browser]
  200 OK  DxfProcessResult {
    success, rooms[], totalLoad, totalLoadKVA,
    totalRooms, unitsDetected, hasFailedRooms, timestamp
  }

[Browser]
  useCustomMutation onSuccess → pushSuccessToast
  ResultsDisplay.tsx renders:
    ├─ Summary card (total load kVA, room count, units)
    ├─ Per-room table (name, type, area, lighting VA, sockets VA, total VA, SBC ref)
    └─ Warning banner if hasFailedRooms
```

---

### Scenario 2 — Client-Side Validation Failure

User selects a non-DXF file or a file that exceeds the 10 MB limit.

```
[Browser]
  FileUpload.tsx — handleFile(file)
        │
        ▼
  validateDxfFile(file)
        ├─ !file.name.endsWith('.dxf')  →  "Only .dxf files are accepted"
        ├─ file.size > MAX_UPLOAD_SIZE_BYTES → "File must be ≤ 10 MB"
        └─ file.size === 0  →  "File is empty"
        │  FAIL — no upload triggered
        ▼
  setValidationError(message)
  Error message rendered inline in FileUpload component
  Upload button remains disabled
```

---

### Scenario 3 — Server-Side Validation Failure

File passes client checks but server rejects it (e.g., malformed DXF content).

```
[Browser → Server]
  POST /api/dxf  (valid .dxf extension, correct size)

[Server]
  File validation layer:
    ├─ formData.get('file') not instanceof File  →  400 "No file provided"
    ├─ Extension check (server-side repeat)      →  400 "Only .dxf files are accepted"
    ├─ size > MAX_UPLOAD_SIZE_BYTES              →  400 "File exceeds X MB limit"
    └─ size === 0                                →  400 "File is empty"

  processDxfFile() — geometry phase:
    ├─ dxf-parser throws / returns invalid data  →  422 "DXF parsing failed"
    └─ geometry.rawRooms.length === 0            →  422 "No rooms found…"

[Server → Browser]
  4xx JSON { error: "…" }

[Browser]
  useCustomMutation onError → normalizeError(err) → pushErrorToast(message)
  Error toast displayed; form remains available for retry
```

---

### Scenario 4 — RAG Unavailable (Degraded AI Mode)

The Supabase connection fails or env vars are missing, but the AI can still proceed with training knowledge.

```
[Server]
  searchSaudiCode() throws (Supabase connection fails)
        │
        ▼
  try/catch in dxf-load.post.ts swallows the error
  codeContext = ""  (empty string)
        │
        ▼
  buildClassificationPrompt(rooms, "")
        │  Prompt block becomes:
        │  "No SBC 401 code sections were retrieved.
        │   Use your engineering knowledge of Saudi Building Code…"
        ▼
  Gemini classifies rooms using pre-trained knowledge
  Response returned normally; codeReference fields may be less precise

  [No error propagated to client — degraded mode is silent]
```

---

### Scenario 5 — AI Classification Partial Failure

Gemini successfully responds but fails to classify one or more rooms (e.g., unrecognisable Arabic label).

```
[Server]
  classifyRooms() returns a partial classifications array
        │
        ▼
  Merge loop in dxf-load.post.ts:
    For each rawRoom:
      ├─ AI result found for this name?
      │       YES → DxfRoom with lightingLoad, socketsLoad, totalLoad, codeReference
      └─       NO  → DxfRoom with null load fields + error: "AI classification failed"

  hasFailedRooms = true
  totalLoad = sum of non-null room loads only

[Server → Browser]
  200 OK  DxfProcessResult { ..., hasFailedRooms: true, rooms: [...] }

[Browser]
  ResultsDisplay renders:
    ├─ Warning banner: "Some rooms could not be classified"
    ├─ Failed rooms shown in table with "—" load values and error badge
    └─ Total load reflects only successfully classified rooms
```

---

### Scenario 6 — Supabase Index Build (Prebuild Script)

Run once before `npm run dev` or `npm run build` to embed SBC 401 into Supabase pgvector.

```
npm run prebuild
  └─ tsx scripts/build-supabase-index.ts

[Script]
  Verify SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
  Query documents table row count
    ├─ count > 0 and no --force flag → skip, log message, exit
    └─ count === 0 or --force ↓

  PDFLoader('public/saudi-code/Load Estimation for Saudi Code.pdf')
        │
        ▼
  RecursiveCharacterTextSplitter({
    chunkSize: 1000, chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', ' ', '']
  })
  → N overlapping document chunks
        │
        ▼
  GoogleGenerativeAIEmbeddings('gemini-embedding-001')
  SupabaseVectorStore.fromDocuments(batch, embeddings)
    — batched in groups of 10 to respect Gemini rate limits
    — upserts content + embedding into Supabase documents table
        │
        ▼
  [Done] Chunks stored in Supabase — available immediately at runtime
```

---

### Scenario 7 — Server Startup (Vector Store Warm-Up)

Next.js `instrumentation.ts` validates configuration and pre-initialises the Supabase singleton.

```
Next.js server start
  └─ instrumentation.ts register()
        │
        ├─ Verify NEXT_PUBLIC_GEMINI_API_KEY is set (throws if missing)
        ├─ Verify SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (throws if missing)
        └─ getVectorStore()  →  SupabaseVectorStore singleton created and cached
  [Store ready in memory — subsequent API calls use the cached singleton]
```

---

## Data Models

### `RawRoom` (server-internal, never sent to client)

```typescript
{
  id: number;
  name: string;
  area: number;
} // area in m²
```

### `DxfRoom` (wire type — `src/shared/types/dxf.ts`)

```typescript
{
  id: number;
  name: string;           // original DXF label
  type: string;           // normalised English room type from AI
  area: number;           // m²
  lightingLoad: number | null;  // VA
  socketsLoad:  number | null;  // VA
  totalLoad:    number | null;  // VA
  codeReference: string;  // SBC 401 section
  error?: string;         // set when AI failed for this room
}
```

### `DxfProcessResult` (API response — `src/shared/types/dxf.ts`)

```typescript
{
  success: boolean;
  rooms?: DxfRoom[];
  totalLoad?: number;     // VA
  totalLoadKVA?: number;
  totalRooms?: number;
  unitsDetected?: string;
  hasFailedRooms?: boolean;
  timestamp: string;
  error?: string;
}
```

---

## Testing Strategy

Tests live under `tests/` mirroring `src/`:

| Directory                   | Vitest Environment | Scope                                                                                                |
| --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `tests/client/`             | `jsdom`            | `validateDxfFile`, `normalizeError`, `useCustomMutation`                                             |
| `tests/server/unit/`        | `node`             | `dxf-processor` (mocked `dxf-parser`)                                                                |
| `tests/server/integration/` | `node`             | Full route handler (`processDxfFile`, `classifyRooms`, `searchSaudiCode` all mocked via `vi.mock()`) |

```bash
npm test                # vitest watch
npm run test:coverage   # coverage report
```

---

## Environment & Scripts

```bash
cp .env.example .env          # set NEXT_PUBLIC_GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Run scripts/supabase-setup.sql once in the Supabase SQL Editor
npm run prebuild              # embed SBC 401 PDF into Supabase pgvector (required before first run)
npm run dev                   # Next.js dev server
npm run build                 # prebuild + next build
npm run lint                  # ESLint (0 warnings allowed)
npm run format                # Prettier
```
