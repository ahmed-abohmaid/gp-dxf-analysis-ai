"use client";

import { ResultsDisplay } from "@/features/results/ResultsDisplay";
import { FileUpload } from "@/features/upload/FileUpload";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { useProcessDxf } from "@/hooks/useProcessDxf";

export default function HomePage() {
  const { mutate, data, isPending, reset, error } = useProcessDxf();

  const hasResults = data?.success && (data.rooms?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <Header showReset={!!hasResults} onReset={reset} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <strong className="font-semibold">Error: </strong>
            {error.message}
          </div>
        )}

        {!hasResults ? (
          <div className="mx-auto max-w-2xl">
            <div className="mb-8 text-center">
              <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                Upload Your AutoCAD DXF for Load Estimation
              </h2>
              <p className="text-gray-600">
                Upload a DXF file to run automated room-by-room electrical load calculations
                (lighting &amp; socket loads)
              </p>
            </div>
            <FileUpload onFileSelect={(file) => mutate(file)} isProcessing={isPending} />
          </div>
        ) : (
          <ResultsDisplay results={data!} onReset={reset} />
        )}
      </main>

      <Footer />
    </div>
  );
}
