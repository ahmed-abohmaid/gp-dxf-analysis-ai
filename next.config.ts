import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages use Node.js native modules — must not be bundled by Next.js
  serverExternalPackages: [
    "@langchain/community",
    "@langchain/google-genai",
    "pdf-parse",
    "dxf-parser",
    "@flatten-js/core",
  ],

  // Silence noisy logs from LangChain in dev
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

export default nextConfig;
