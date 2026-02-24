import { getVectorStore } from "@/server/rag/vector-store";

// Minimum cosine similarity score to consider a retrieved chunk relevant.
// Lowered to 0.3 (from 0.5) to capture numeric-heavy demand/coincident factor
// table chunks, which embed with lower semantic similarity scores than prose
// sections because they contain mostly numbers rather than natural language.
const SIMILARITY_THRESHOLD = 0.3;

// Simple FIFO in-memory cache for identical RAG queries within a server process.
// Eliminates redundant Gemini Embeddings API calls when the same room labels appear
// across multiple uploads.
const RAG_CACHE_MAX = 100;
const ragCache = new Map<string, { content: string; source?: string }[]>();

function ragCacheSet(key: string, value: { content: string; source?: string }[]) {
  if (ragCache.size >= RAG_CACHE_MAX) {
    // Evict oldest entry
    ragCache.delete(ragCache.keys().next().value!);
  }
  ragCache.set(key, value);
}

export async function searchSaudiCode(
  query: string,
  topK = 4,
): Promise<{ content: string; source?: string }[]> {
  const cacheKey = `${query}::${topK}`;
  const cached = ragCache.get(cacheKey);
  if (cached) return cached;

  const store = await getVectorStore();
  // Use scored search so we can discard chunks below the similarity threshold,
  // preventing irrelevant SBC sections from polluting the classifier prompt.
  const docsWithScores = await store.similaritySearchWithScore(query, topK);
  const results = docsWithScores
    .filter(([, score]) => score >= SIMILARITY_THRESHOLD)
    .map(([doc]) => ({
      content: doc.pageContent,
      source: doc.metadata?.source as string | undefined,
    }));

  ragCacheSet(cacheKey, results);
  return results;
}
