import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Library cards show the video's YouTube thumbnail.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
  experimental: {
    // Phosphor's entry re-exports ~1,500 icons and is not on Next's built-in
    // list; this rewrites named imports to the one module each icon lives in.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
