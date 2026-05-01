/** Strip HTML tags and collapse whitespace edges (Supabase text fields). */
export function stripHtmlTags(input: string): string {
  return String(input ?? "").replace(/<[^>]*>/g, "");
}

export function sanitizeUserTextField(input: unknown, maxLen?: number): string {
  let s = stripHtmlTags(String(input ?? ""));
  if (maxLen != null && maxLen >= 0) s = s.slice(0, maxLen);
  return s.trim();
}

export function parseValidatedLayerCount(
  raw: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n > 9999) {
    return { ok: false, error: "Layer count must be a whole number between 1 and 9999." };
  }
  return { ok: true, value: n };
}

export function parseValidatedPosition(
  raw: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    return { ok: false, error: "Position must be a whole number between 1 and 5." };
  }
  return { ok: true, value: n };
}

export function validateWebsiteUrl(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = sanitizeUserTextField(raw, 2048);
  if (!trimmed) return { ok: true, value: null };
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, error: "Website URL must use http:// or https://." };
    }
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: "Enter a valid website URL." };
  }
}

export function validateInstagramHandle(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const s = sanitizeUserTextField(raw, 64).replace(/^@+/, "");
  if (!s) return { ok: true, value: null };
  if (!/^[a-zA-Z0-9_.]+$/.test(s)) {
    return {
      ok: false,
      error: "Instagram handle may only contain letters, numbers, underscores, and periods.",
    };
  }
  return { ok: true, value: s };
}
