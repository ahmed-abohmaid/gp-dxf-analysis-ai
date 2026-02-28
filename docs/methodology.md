# Electrical Load Calculator — Project Methodology

## Overview

A **Next.js 15 App Router** web application that accepts AutoCAD DXF floor-plan files and produces
per-room electrical load estimates compliant with **DPS-01** (Saudi Electricity Company Load
Estimation Standard, a.k.a. SBC 401). The system combines deterministic geometry processing with a
**two-phase AI pipeline** — Phase 1 classifies rooms to DPS-01 category codes (C1–C29), Phase 2
extracts load densities and demand factors from the code PDF via RAG.

---

## Architecture

```
Browser (React 19)
    │  multipart/form-data (DXF file + electricalCode)
    ▼
POST /api/dxf  (Next.js Route Handler)
    │
    ├─ Step 1 — Geometry  →  processDxfFile()
    │       dxf-parser  →  @flatten-js/core
    │       Extracts closed polylines → room polygons + areas (m²)
    │       Resolves ditto marks (" or ") to nearest preceding label
    │       Aggregates duplicate room names into unique type inputs
    │
    ├─ Step 2 — Parallel RAG  →  buildRagQueries() → 6 queries
    │       classificationQueries[2]  → searchSaudiCode(q, topK=5)
    │       valueQueries[4]           → searchSaudiCode(q, topK=6)
    │       Deduplicates chunks → classificationContext + valueContext
    │
    ├─ Step 3 — Phase 1 AI: Classification only
    │       classifyRooms(uniqueRooms, classificationContext)
    │       generateText()  →  Gemini Flash (gemini-2.5-flash)
    │       Returns: { roomLabel, roomType, customerCategory,
    │                  codeReference, classificationReason } per room
    │       NO numbers — categories only
    │
    ├─ Step 4 — Phase 2 AI: Value extraction per unique category
    │       extractCategoryValues(uniqueCategories, valueContext)
    │       generateText()  →  Gemini Flash
    │       Returns: { customerCategory, loadDensityVAm2, loadsIncluded,
    │                  demandFactor, c1c2KvaTable?, c1c2ExtendedDensityVAm2? }
    │
    ├─ Step 5 — C1/C2 interpolation (if kVA table returned)
    │       interpolateLoadTable(kvaTable, totalCategoryAreaM2)
    │       → effective VA/m² via linear interpolation
    │
    └─ Step 6 — Load computation per room
            connectedLoad = loadDensityVAm2 × area
            demandLoad    = connectedLoad × demandFactor × coincidentFactor
            coincidentFactor = 1.0 (N=1 KWH meter; multi-meter CF coming soon)
```

### Module Boundaries

| Layer                  | Path                              | Rule                                               |
| ---------------------- | --------------------------------- | -------------------------------------------------- |
| Server-only            | `src/server/`                     | Never imported by client components                |
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

| Package                                                | Usage                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `next@16`                                              | App Router framework; API route handler at `src/app/api/dxf/route.ts`                                                  |
| `react@19` / `react-dom@19`                            | UI runtime                                                                                                             |
| `@ai-sdk/google` + `ai`                                | `generateText()` with `Output.object()` for structured Gemini output                                                   |
| `@langchain/community`                                 | `SupabaseVectorStore` — queries the Supabase pgvector store; `PDFLoader` — loads SBC 401 PDF during `prebuild`         |
| `@langchain/google-genai`                              | `GoogleGenerativeAIEmbeddings` (`gemini-embedding-001`) — used at index build time and similarity search               |
| `@supabase/supabase-js`                                | Supabase client — connects to the pgvector store for document storage and retrieval                                    |
| `@langchain/textsplitters`                             | `RecursiveCharacterTextSplitter` — chunks SBC 401 text into 1 000-char overlapping segments during `prebuild`          |
| `@langchain/core`                                      | LangChain document types shared across LangChain integrations                                                          |
| `dxf-parser`                                           | Parses raw DXF text into a structured entity tree                                                                      |
| `@flatten-js/core`                                     | Polygon area computation and point-in-polygon test for room label matching                                             |
| `@tanstack/react-query@5`                              | Server-state management; wrapped by `useCustomMutation` / `useCustomQuery`                                             |
| `zod@4`                                                | `ClassificationSchema` (Phase 1) + `CategoryValuesSchema` (Phase 2) for Gemini structured output; API input validation |
| `sileo`                                                | Toast notification system (consumed via `pushErrorToast` / `pushSuccessToast`)                                         |
| `lucide-react`                                         | Icon set used throughout the UI                                                                                        |
| `radix-ui` + shadcn components                         | Accessible UI primitives (Card, Button, Badge, Table, etc.)                                                            |
| `class-variance-authority` + `clsx` + `tailwind-merge` | Conditional class name utilities                                                                                       |
| `tw-animate-css`                                       | Tailwind CSS animation utilities                                                                                       |

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

  ── Phase 2: Parallel RAG — 6 queries ──────────────
  buildRagQueries() → classificationQueries[2] + valueQueries[4]
  Promise.all → searchSaudiCode() per query
    │  each: FIFO cache check → HIT return | MISS ↓
    │  similaritySearchWithScore → embed → match_documents() RPC
    │  filter chunks below similarity 0.5
    └─ Deduplicate → classificationContext + valueContext strings

  ── Phase 3: AI Classification (categories only) ────
  Deduplicate rooms by normalised label
  classifyRooms(uniqueRooms, classificationContext)
    ▼
  generateText({ Output.object(ClassificationSchema) })
    │  Returns per unique room:
    │    { roomLabel, roomType, customerCategory,
    │      codeReference, classificationReason }
    │  NO density or factor values

  ── Phase 4: AI Value Extraction (per unique category) ─
  extractCategoryValues(uniqueCategories, valueContext)
    ▼
  generateText({ Output.object(CategoryValuesSchema) })
    │  Returns per category:
    │    { loadDensityVAm2, loadsIncluded, demandFactor,
    │      c1c2KvaTable?, c1c2ExtendedDensityVAm2? }

  ── Phase 5: Load Computation ───────────────────────
  For C1/C2: interpolateLoadTable(kvaTable, totalCategoryArea) → effective VA/m²
  For each raw room:
    connectedLoad = round2(loadDensityVAm2 × area)
    demandLoad    = round2(connectedLoad × demandFactor × 1.0)
  computeBuildingSummary() → totals + categoryBreakdown[]
  Set hasFailedRooms = true if any room lacks AI output

[Server → Browser]
  200 OK  DxfProcessResult {
    success, rooms[], totalConnectedLoad, totalDemandLoad, totalDemandLoadKVA,
    effectiveDemandFactor, coincidentFactor, categoryBreakdown[],
    totalRooms, unitsDetected, hasFailedRooms, timestamp
  }

[Browser]
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
  try/catch in dxf-load.post.ts swallows the error
  classificationContext = ""  (empty string)
  valueContext = ""
        │
        ▼
  classifyRooms(rooms, "")
        │  Prompt: "No code sections retrieved. Use engineering knowledge…"
        ▼
  Gemini classifies rooms using pre-trained knowledge; codeReference fields may be less precise
  extractCategoryValues(categories, "")
        │  Gemini returns density/factor estimates from pre-training
        ▼
  Pipeline continues normally with AI-estimated values

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
      ├─ Phase 1 result found?
      │       YES → look up Phase 2 values → compute connectedLoad + demandLoad
      └─       NO  → DxfRoom with loadDensityVAm2=null, connectedLoad=null +
                     error: "AI classification failed"

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
  type: string;                  // normalised English room type from Phase 1 AI
  customerCategory: string;      // DPS-01 category code, e.g. "C1"
  area: number;                  // m²
  loadDensityVAm2: number | null; // combined VA/m² from Phase 2 AI (null if AI failed)
  loadsIncluded: string | null;  // what the density covers, e.g. "Lights + AC + Sockets"
  connectedLoad: number | null;  // loadDensityVAm2 × area (VA)
  demandFactor: number | null;   // from DPS-01 Table 11
  demandLoad: number | null;     // connectedLoad × demandFactor (VA)
  codeReference: string;         // DPS-01 section from Phase 1 AI
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

| Directory                   | Vitest Environment | Scope                                                                                                                         |
| --------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `tests/client/`             | `jsdom`            | `validateDxfFile`, `normalizeError`, `useCustomMutation`                                                                      |
| `tests/server/unit/`        | `node`             | `dxf-processor` (mocked `dxf-parser`), `factors-calculator`                                                                   |
| `tests/server/integration/` | `node`             | Full route handler (`processDxfFile`, `classifyRooms`, `extractCategoryValues`, `searchSaudiCode` all mocked via `vi.mock()`) |

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
