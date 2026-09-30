import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Library cards show the video's YouTube thumbnail.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
};

export default nextConfig;
