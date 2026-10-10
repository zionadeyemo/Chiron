import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A separate build dir lets the end-to-end server run beside your own dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
