function isPngMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isJpegMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Verify URL points at Supabase storage for this project and returns PNG/JPEG magic bytes.
 */
export async function assertSupabaseImageUrlIsPngOrJpeg(
  imageUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return { ok: false, error: "Server misconfigured (missing Supabase URL)." };

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return { ok: false, error: "Invalid image URL." };
  }

  let allowedHost: string;
  try {
    allowedHost = new URL(baseUrl).hostname;
  } catch {
    return { ok: false, error: "Server misconfigured (invalid Supabase URL)." };
  }

  if (parsed.hostname !== allowedHost) {
    return { ok: false, error: "Image URL host is not allowed." };
  }

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch(parsed.toString(), {
      method: "GET",
      headers: { Range: "bytes=0-15" },
      redirect: "follow",
      signal: ac.signal,
    });
    clearTimeout(t);

    if (!res.ok && res.status !== 206) {
      return { ok: false, error: `Could not read image (${res.status}).` };
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (isPngMagic(buf) || isJpegMagic(buf)) return { ok: true };
    return { ok: false, error: "Image must be PNG or JPEG (magic-byte check failed)." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Image verification failed: ${msg}` };
  }
}
