import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  images: {
    domains: ["gmlcbfbrlpktqbkigqcw.supabase.co"],
  },
};

export default nextConfig;