export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      throw new Error(
        "[ELC] GEMINI_API_KEY is required but not set. Server cannot start without it.",
      );
    }
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("[ELC] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required but not set.");
    }
    try {
      const { getVectorStore } = await import("./src/server/rag/vector-store");
      await getVectorStore();
      console.log("[instrumentation] Supabase vector store initialised ✓");
    } catch (err) {
      console.error("[instrumentation] Failed to initialise Supabase vector store:", err);
    }
  }
}
