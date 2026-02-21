import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createClient } from "@supabase/supabase-js";

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  modelName: "gemini-embedding-001",
});

let initPromise: Promise<SupabaseVectorStore> | null = null;

export function getVectorStore(): Promise<SupabaseVectorStore> {
  if (!initPromise) {
    initPromise = Promise.resolve()
      .then(() => {
        // Accept both bare and NEXT_PUBLIC_ prefixed names so .env.local works
        // regardless of which naming convention was used
        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey =
          process.env.SUPABASE_SERVICE_ROLE_KEY ??
          process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseKey) {
          throw new Error(
            "[ELC] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required but not set.",
          );
        }
        const client = createClient(supabaseUrl, supabaseKey);
        return new SupabaseVectorStore(embeddings, {
          client,
          tableName: "documents",
          queryName: "match_documents",
        });
      })
      .catch((err) => {
        // Reset so the next call retries
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}

// @future: used in cleanup utilities or test teardown to reset the singleton
export function resetVectorStore(): void {
  initPromise = null;
}
