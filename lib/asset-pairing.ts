/** Case-insensitive PSD + raster pairing for admin batch uploads (basename / pairing key). */

export function basenameWithoutExt(filename: string): string {
  const n = filename.trim();
  const i = n.lastIndexOf(".");
  if (i <= 0) return n;
  return n.slice(0, i);
}

export function isPsdFile(file: File) {
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();
  return (
    name.endsWith(".psd") ||
    mime === "image/vnd.adobe.photoshop" ||
    mime === "application/x-photoshop" ||
    mime === "application/vnd.adobe.photoshop" ||
    mime === "application/photoshop"
  );
}

export function isRasterGameImage(file: File) {
  return file.type === "image/png" || file.type === "image/jpeg";
}

/** Case-insensitive pairing key: alphanumeric only from stem (spaces & specials stripped). */
export function pairingKeyFromFile(file: File): string {
  const stem = basenameWithoutExt(file.name);
  const raw = stem.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (raw) return raw;
  return `__uniq_${file.name}_${file.size}_${file.lastModified}`;
}

export function formatTitleFromStem(stem: string): string {
  const spaced = stem.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export type FilePairSpec = {
  key: string;
  /** Original stem (before pairing normalization) for display title. */
  displayStem: string;
  psd: File | null;
  raster: File | null;
};

export function buildPairSpecs(files: File[]): FilePairSpec[] {
  const buckets = new Map<string, { psd: File | null; raster: File | null }>();

  for (const f of files) {
    const key = pairingKeyFromFile(f);
    let b = buckets.get(key);
    if (!b) {
      b = { psd: null, raster: null };
      buckets.set(key, b);
    }
    if (isPsdFile(f)) {
      if (!b.psd) b.psd = f;
    } else if (isRasterGameImage(f)) {
      if (!b.raster) {
        b.raster = f;
      } else {
        const nextIsPng =
          f.name.toLowerCase().endsWith(".png") || f.type === "image/png";
        const curIsPng =
          b.raster.name.toLowerCase().endsWith(".png") ||
          b.raster.type === "image/png";
        if (nextIsPng && !curIsPng) b.raster = f;
      }
    }
  }

  const specs: FilePairSpec[] = Array.from(buckets.entries()).map(([key, b]) => {
    const displayStem = b.psd
      ? basenameWithoutExt(b.psd.name)
      : b.raster
        ? basenameWithoutExt(b.raster.name)
        : key;
    return { key, displayStem, psd: b.psd, raster: b.raster };
  });

  specs.sort((a, b) =>
    a.displayStem.localeCompare(b.displayStem, undefined, { sensitivity: "base" }),
  );
  return specs;
}
