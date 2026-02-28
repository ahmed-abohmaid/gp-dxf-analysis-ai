# Electrical Load Calculator — Project Methodology

## Overview

A **Next.js 16 App Router** web application that accepts AutoCAD DXF floor-plan files and produces
per-room electrical load estimates compliant with **DPS-01** (Saudi Electricity Company Load
Estimation Standard, a.k.a. SBC 401). The system combines deterministic geometry processing with a
**single-pass AI pipeline** — `analyzeRooms()` classifies rooms to DPS-01 category codes (C1–C29)
and extracts load densities, demand factors, and C1/C2 interpolation in one `generateObject()` call.
Progress is streamed to the browser via **Server-Sent Events (SSE)**.

---

## Architecture

```
Browser (React 19)
    │  multipart/form-data (DXF file + electricalCode)
    ▼
POST /api/dxf  (Next.js Route Handler — text/event-stream SSE)
    │
    ├─ Step 1 — Geometry  →  processDxfFile() + aggregateRooms()
    │       dxf-parser  →  @flatten-js/core
    │       Extracts closed polylines → room polygons + areas (m²)
    │       aggregateRooms():
    │         Pass 1 — resolve ditto marks to nearest preceding label
    │         Pass 2 — deduplicate by normalised key → uniqueRoomInputs + roomAggregates
    │       ── SSE: event: progress ("Parsing DXF geometry") ──
    │
    ├─ Step 2 — Parallel RAG  →  buildRagQueries() → 4 queries
    │       Returns [string, string, string, string] tuple
    │       Promise.all → searchSaudiCode() × 4, similarity threshold 0.5
    │       ── SSE: event: progress ("Retrieving Saudi code context") ──
    │
    ├─ Step 3 — Single-pass AI  →  analyzeRooms()
    │       generateObject()  →  Gemini Flash (gemini-2.5-flash)
    │       RoomAnalysisSchema — per unique room:
    │         { roomLabel, roomType, customerCategory, categoryDescription,
    │           loadDensityVAm2, demandFactor, loadsIncluded, acIncluded,
    │           codeReference, classificationReason }
    │       C1/C2 interpolation: AI receives totalAreaForType and interpolates
    │       from Tables 3–6 inside the prompt → returns final VA/m² directly
    │       ── SSE: event: progress ("Analyzing rooms with AI") ──
    │
    └─ Step 4 — Load assembly  →  assembleLoads() + computeRoomDemandLoad()
            connectedLoad = round2(loadDensityVAm2 × area)
            demandLoad    = round2(connectedLoad × demandFactor × coincidentFactor)
            coincidentFactor = 1.0  // @future: multi-meter buildings
            computeBuildingSummary() → totals + categoryBreakdown[]
            ── SSE: event: progress ("Computing final loads") ──
            ── SSE: event: result (full DxfProcessResult JSON) ──
```

### Module Boundaries

| Layer                  | Path                              | Rule                                               |
| ---------------------- | --------------------------------- | -------------------------------------------------- |
| Server pipeline        | `src/server/pipeline/`            | HTTP handler, validation, aggregation, assembly    |
| Server AI              | `src/server/ai/`                  | Single-pass analyzer, Gemini client, prompts/      |
| Server DXF             | `src/server/dxf/`                 | Parser, polygon builder, unit detector, matcher    |
| Server calculations    | `src/server/calculation/`         | Demand-load computation                            |
| Server RAG             | `src/server/rag/`                 | Vector store, query builder, Saudi code loader     |
| Shared wire types      | `src/shared/`                     | Used by both client and server                     |
| React feature root     | `src/features/<name>/`            | Client components only                             |
| Feature sub-components | `src/features/<name>/components/` | Components owned exclusively by that feature       |
| Feature hooks          | `src/features/<name>/hooks/`      | Hooks used only by that feature                    |
| Feature utils          | `src/features/<name>/utils/`      | Utils used only by that feature                    |
| TanStack Query hooks   | `src/hooks/`                      | Always wrap `useCustomMutation` / `useCustomQuery` |
| shadcn/ui primitives   | `src/components/ui/`              | New-york style                                     |

---

## Packages & Usage

### Runtime Dependencies

| Package                                                | Usage                                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `next@16`                                              | App Router framework; API route handler at `src/app/api/dxf/route.ts`                                          |
| `react@19` / `react-dom@19`                            | UI runtime                                                                                                     |
| `@ai-sdk/google` + `ai`                                | `generateObject()` with `Output.object()` for single-pass structured Gemini output                             |
| `@langchain/community`                                 | `SupabaseVectorStore` — queries the Supabase pgvector store; `PDFLoader` — loads SBC 401 PDF during `prebuild` |
| `@langchain/google-genai`                              | `GoogleGenerativeAIEmbeddings` (`gemini-embedding-001`) — used at index build time and similarity search       |
| `@supabase/supabase-js`                                | Supabase client — connects to the pgvector store for document storage and retrieval                            |
| `@langchain/textsplitters`                             | `RecursiveCharacterTextSplitter` — chunks SBC 401 text into 1 000-char overlapping segments during `prebuild`  |
| `@langchain/core`                                      | LangChain document types shared across LangChain integrations                                                  |
| `dxf-parser`                                           | Parses raw DXF text into a structured entity tree                                                              |
| `@flatten-js/core`                                     | Polygon area computation and point-in-polygon test for room label matching                                     |
| `@tanstack/react-query@5`                              | Server-state management; wrapped by `useCustomMutation` / `useCustomQuery`                                     |
| `zod@4`                                                | `RoomAnalysisSchema` — unified single-pass Gemini output schema; `MAX_UPLOAD_SIZE_BYTES` validation            |
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

[Server — POST /api/dxf — SSE text/event-stream]
  ── Step 1: Geometry ────────────────────────────────
  validateDxfRequest(req) — electricalCode, extension, size ≤ 10 MB, non-empty
  processDxfFile(content)
    │
    ├─ parseDxfContent()  →  entity tree (dxf-parser)
    ├─ buildRoomPolygons()  →  Flatten.Polygon per closed LWPOLYLINE / POLYLINE
    ├─ detectUnits()  →  mm vs m (avg area > 500 000 → mm, divide by 1 000 000)
    ├─ matchTextsToRooms()  →  point-in-polygon → text label per room polygon
    └─ DxfGeometryResult { rawRooms[], unitsDetected, layersUsed, ... }
  aggregateRooms(geometry)
    │
    ├─ Pass 1: resolve ditto marks (" / " / ") to nearest preceding label
    └─ Pass 2: normalise key (UPPERCASE + trim) → accumulate totalAreaForType
    AggregateResult { resolvedLabels[], uniqueRoomInputs[], roomAggregates }
  ── SSE: event: progress ("Parsing DXF geometry") ──

  ── Step 2: Parallel RAG — 4 queries ───────────────
  buildRagQueries() → [string, string, string, string]
  Promise.all → searchSaudiCode() × 4
    │  similaritySearchWithScore → embed → match_documents() RPC
    │  filter chunks below similarity 0.5
    └─ Returns 4-tuple of context strings
  ── SSE: event: progress ("Retrieving Saudi code context") ──

  ── Step 3: Single-pass AI ──────────────────────────
  analyzeRooms(uniqueRoomInputs, ragContext, includeAC)
    ▼
  generateObject({ schema: RoomAnalysisSchema })  →  Gemini Flash
    │  Per unique room:
    │    { roomLabel, roomType, customerCategory, categoryDescription,
    │      loadDensityVAm2, demandFactor, loadsIncluded, acIncluded,
    │      codeReference, classificationReason }
    │  C1/C2: AI interpolates totalAreaForType using Tables 3–6 inside prompt
    │         → returns final VA/m² directly (no post-processing step)
  ── SSE: event: progress ("Analyzing rooms with AI") ──

  ── Step 4: Load Assembly ───────────────────────────
  assembleLoads(geometry, analysisResults, resolvedLabels)
    │  For each raw room: look up AI result by normalised key
    │    Found → connectedLoad = loadDensityVAm2 × area
    │    Missing → DxfRoom with null loads + error string
  computeRoomDemandLoad(roomLoadInputs)
    │  demandLoad = round2(connectedLoad × demandFactor × 1.0)
  computeBuildingSummary() → totals + categoryBreakdown[]
  Set hasFailedRooms = true if any room lacks AI output
  ── SSE: event: progress ("Computing final loads") ──
  ── SSE: event: result ({ ...DxfProcessResult }) ──

[Server → Browser]  (SSE stream)
  event: progress  data: "Parsing DXF geometry"
  event: progress  data: "Retrieving Saudi code context"
  event: progress  data: "Analyzing rooms with AI"
  event: progress  data: "Computing final loads"
  event: result    data: { ...DxfProcessResult JSON }

[Browser]
  postProcessDxf() parses SSE line-by-line → calls onProgress() per step
  useProcessDxf() updates progressStep → FileDropZone shows step indicator
  useCustomMutation onSuccess → pushSuccessToast
  ResultsDisplay.tsx renders:
    ├─ Summary card (total connected kVA, demand kVA, effective DF, room count)
    ├─ Per-room table (name, type, category badge, area, VA/m²,
    │                  connected VA, demand factor, demand VA, code ref)
    ├─ Per-category breakdown table
    └─ Warning banner if hasFailedRooms
```

---

### Scenario 2 — Client-Side Validation Failure

User selects a non-DXF file or a file that exceeds the 10 MB limit.

```
[Browser]
  FileDropZone.tsx — handleFile(file)
        │
        ▼
  validateDxfFile(file)
        ├─ !file.name.endsWith('.dxf')  →  "Only .dxf files are accepted"
        ├─ file.size > MAX_UPLOAD_SIZE_BYTES → "File must be ≤ 10 MB"
        └─ file.size === 0  →  "File is empty"
        │  FAIL — no upload triggered
        ▼
  setValidationError(message)
  Error message rendered inline below FileDropZone
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
    ├─ electricalCode !== "DPS-01"              →  400 "Electrical code not supported"
    ├─ formData.get('file') not instanceof File →  400 "No file provided"
    ├─ Extension check (server-side repeat)     →  400 "Only .dxf files are accepted"
    ├─ size > MAX_UPLOAD_SIZE_BYTES             →  400 "File exceeds X MB limit"
    └─ size === 0                               →  400 "File is empty"

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
  try/catch in orchestrator.ts swallows the error
  ragContext = ["", "", "", ""]  (empty strings)
        │
        ▼
  analyzeRooms(rooms, ragContext, includeAC)
        │  Prompt: "No code sections retrieved. Use engineering knowledge…"
        ▼
  Gemini classifies and estimates loads using pre-trained knowledge; codeReference fields may be less precise
  Pipeline continues normally with AI-estimated values

  [No error propagated to client — degraded mode is silent]
```

---

### Scenario 5 — AI Classification Partial Failure

Gemini successfully responds but fails to classify one or more rooms (e.g., unrecognisable Arabic label).

```
[Server]
  analyzeRooms() returns a partial results array (some rooms missing)
        │
        ▼
  assembleLoads() merge loop:
    For each rawRoom:
      ├─ AI result found (normalised key match)?
      │       YES → connectedLoad = loadDensityVAm2 × area, demandLoad computed
      └─       NO  → DxfRoom with loadDensityVAm2=null, connectedLoad=null +
                     error: "AI classification failed for this room"

  hasFailedRooms = true
  totalConnectedLoad / totalDemandLoad = sum of non-null room loads only

[Server → Browser]
  200 OK  DxfProcessResult { ..., hasFailedRooms: true, rooms: [...] }

[Browser]
  ResultsDisplay renders:
    ├─ Warning banner: "Some rooms could not be classified"
    ├─ Failed rooms shown in table with "—" values (loadDensityVAm2=null)
    └─ Building totals reflect only successfully classified rooms
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
  area: number;        // m²
  allLabels?: string[]; // all text entities found inside this polygon boundary
}
```

### `DxfRoom` (wire type — `src/shared/types/dxf.ts`)

```typescript
{
  id: number;
  name: string;                  // DXF label (ditto-resolved if applicable)
  type: string;                  // normalised English room type from AI
  customerCategory: string;      // DPS-01 category code, e.g. "C1"
  categoryDescription: string;   // human-readable DPS-01 category name from AI
  area: number;                  // m²
  loadDensityVAm2: number | null; // combined VA/m² from AI (null if AI failed)
  loadsIncluded: string | null;  // what the density covers, e.g. "Lights + AC + Sockets"
  acIncluded: boolean | null;    // whether AC loads are included in the density
  connectedLoad: number | null;  // loadDensityVAm2 × area (VA)
  demandFactor: number | null;   // from DPS-01 Table 11
  demandLoad: number | null;     // connectedLoad × demandFactor (VA)
  codeReference: string;         // DPS-01 section from AI
  error?: string;                // set when AI failed for this room
}
```

### `CategoryBreakdown` (per-category summary — `src/shared/types/dxf.ts`)

```typescript
{
  category: string; // e.g. "C1"
  description: string; // human-readable from DPS-01 Table 2
  roomCount: number;
  connectedLoad: number; // sum for this category (VA)
  demandFactor: number; // average demand factor
  coincidentFactor: number;
  demandLoad: number; // sum of demand loads (VA)
  loadDensityVAm2: number;
  loadsIncluded: string;
}
```

### `DxfProcessResult` (API response — `src/shared/types/dxf.ts`)

```typescript
{
  success: boolean;
  rooms?: DxfRoom[];
  totalConnectedLoad?: number;    // VA — sum of all room connected loads
  totalDemandLoad?: number;       // VA — sum of all room demand loads
  totalDemandLoadKVA?: number;
  effectiveDemandFactor?: number; // totalDemandLoad / totalConnectedLoad
  coincidentFactor?: number;      // building-level CF (1.0 while N=1 KWH meter)
  categoryBreakdown?: CategoryBreakdown[];
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

| Directory            | Vitest Environment | Scope                                                                                                                          |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `tests/client/`      | `jsdom`            | `validateDxfFile`, `normalizeError`, `useCustomMutation`                                                                       |
| `tests/server/unit/` | `node`             | `dxf-processor` (mocked `dxf-parser`), `factors-calculator`, `normalize`, `dxf-validator`, `room-aggregator`, `load-assembler` |

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
