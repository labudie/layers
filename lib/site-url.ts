/** Canonical URL for share links (override with NEXT_PUBLIC_SITE_URL in env). */
export const SITE_SHARE_URL =
  typeof process.env.NEXT_PUBLIC_SITE_URL === "string" &&
  process.env.NEXT_PUBLIC_SITE_URL.length > 0
    ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
    : "https://layersgame.com";
