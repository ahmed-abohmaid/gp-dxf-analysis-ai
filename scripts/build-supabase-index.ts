/**
 * Prebuild script: Embeds the full SBC 401 PDF into Supabase pgvector.
 * Run via: npm run prebuild  (or: tsx scripts/build-supabase-index.ts)
 * Pass --force to clear existing documents before rebuilding.
 *
 * Prerequisites:
 *   1. Create a Supabase project at https://supabase.com (free tier works)
 *   2. Run scripts/supabase-setup.sql in the Supabase SQL Editor
 *   3. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import fs from "fs/promises";
import path from "path";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load .env then .env.local (mirrors Next.js precedence)
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const PDF_FILE = path.join(
  process.cwd(),
  "public",
  "saudi-code",
  "Load Estimation for Saudi Code.pdf",
);

async function main() {
  const force = process.argv.includes("--force");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
    process.exit(1);
  }

  const client = createClient(supabaseUrl, supabaseKey);

  if (force) {
    console.log("🗑  --force: clearing existing documents…");
    const { error } = await client
      .from("documents")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.error("❌ Failed to clear documents table:", error.message);
      process.exit(1);
    }
    console.log("   Documents table cleared.");
  } else {
    // Skip if documents already exist
    const { count, error } = await client
      .from("documents")
      .select("id", { count: "exact", head: true });
    if (!error && count && count > 0) {
      console.log(
        `[ELC] Supabase already contains ${count} document chunks — skipping rebuild (pass --force to override).`,
      );
      return;
    }
  }

  console.log("📚 Loading SBC 401 PDF…");

  try {
    await fs.access(PDF_FILE);
  } catch {
    console.error(`❌ PDF not found: ${PDF_FILE}`);
    console.error(
      "   Place 'Load Estimation for Saudi Code.pdf' in public/saudi-code/ and re-run.",
    );
    process.exit(1);
  }

  // Load all pages as a single document to preserve cross-page context
  const loader = new PDFLoader(PDF_FILE, { splitPages: false });
  const rawDocs = await loader.load();
  const totalChars = rawDocs.reduce((sum, d) => sum + d.pageContent.length, 0);
  console.log(`   Read ${totalChars.toLocaleString()} characters from PDF.`);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });

  const docs = await splitter.splitDocuments(rawDocs);
  docs.forEach((d) => {
    d.metadata.source = "SBC 401 PDF";
  });
  console.log(`   Split into ${docs.length} chunks.`);

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY!,
    modelName: "gemini-embedding-001",
  });

  console.log("🔢 Generating embeddings and uploading to Supabase…");

  // Upload in small batches to respect Gemini rate limits
  const BATCH_SIZE = 10;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    process.stdout.write(
      `   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(docs.length / BATCH_SIZE)}…\r`,
    );
    await SupabaseVectorStore.fromDocuments(batch, embeddings, {
      client,
      tableName: "documents",
      queryName: "match_documents",
    });
  }

  console.log(`\n✅ Supabase index built — ${docs.length} chunks uploaded.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
