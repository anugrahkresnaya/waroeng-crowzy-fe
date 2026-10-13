import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Offline-first, client-only game: no server features, so ship it as a static export.
  output: "export",
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
