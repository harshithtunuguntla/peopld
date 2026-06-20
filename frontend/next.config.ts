import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev indicator (the bottom-left logo). It only shows in
  // `next dev` anyway, but we suppress it so local demos/screenshots look fully
  // productized.
  devIndicators: false,
};

export default nextConfig;
