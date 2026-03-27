import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  images: {
    domains: ["gmlcbfbrlpktqbkigqcw.supabase.co"],
  },
};

export default nextConfig;
