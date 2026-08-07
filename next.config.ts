import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // pdfjs-dist (via pdf-parse) dynamically imports its worker file by a
  // relative path that Turbopack/webpack bundling breaks — keep it external
  // so Node resolves it directly from node_modules instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
