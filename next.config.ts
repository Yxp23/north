import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // No floating Next.js badge in the corner (it is not part of North's design).
  devIndicators: false,
  // The old separate pages now live inside Find and Money.
  async redirects() {
    return [
      { source: "/shop", destination: "/find", permanent: false },
      { source: "/choose", destination: "/find", permanent: false },
      { source: "/reorder", destination: "/find", permanent: false },
      { source: "/payments", destination: "/money", permanent: false },
    ];
  },
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
