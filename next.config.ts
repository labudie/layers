import type { NextConfig } from "next";

function getSupabaseImageDomain() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

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
