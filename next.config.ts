import type { NextConfig } from "next";

// A Vercel build without Supabase would deploy an app that can't store anything: fail the build.
if ((process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error(`CHIRON: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the ${process.env.VERCEL_ENV} environment in Vercel.`);
}

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
