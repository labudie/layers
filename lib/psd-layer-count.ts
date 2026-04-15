/**
 * Parses a classic PSD (version 1) and returns the count of **visible** raster layers
 * with non-zero bounds. Uses layer record flags: bit 0x02 set ⇒ hidden (matches common
 * parsers / psd-tools: visible = !(flags & 2)).
 *
 * Skips layers with zero width or height (typical of adjustment / empty layer records).
 */
export function parsePsdLayerCount(buffer: ArrayBuffer): number | null {
  const u8 = new Uint8Array(buffer);
  if (u8.length < 40) return null;

  const sig = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
  if (sig !== "8BPS") return null;

  const dv = new DataView(buffer);
  const version = dv.getUint16(4, false);
  if (version !== 1) return null;

  let off = 26;

  const readU32 = () => {
    if (off + 4 > u8.length) return -1;
    const v = dv.getUint32(off, false);
    off += 4;
    return v;
  };

  const colorModeLen = readU32();
  if (colorModeLen < 0 || off + colorModeLen > u8.length) return null;
  off += colorModeLen;

  const imageResourcesLen = readU32();
  if (imageResourcesLen < 0 || off + imageResourcesLen > u8.length) return null;
  off += imageResourcesLen;

  /** Length of entire layer + mask information section (excludes this 4-byte field). */
  const layerAndMaskSectionLen = readU32();
  if (layerAndMaskSectionLen < 0) return null;
  const layerAndMaskEnd = off + layerAndMaskSectionLen;
  if (layerAndMaskEnd > u8.length) return null;

  if (layerAndMaskSectionLen === 0) return 0;

  /** Length of layer info subsection (layer count + records + channel image data). */
  const layerInfoSize = readU32();
  if (layerInfoSize < 0 || off + layerInfoSize > u8.length) return null;
  const layerInfoEnd = off + layerInfoSize;

  if (layerInfoSize < 2) return 0;

  if (off + 2 > u8.length) return null;
  const layerCountRaw = dv.getInt16(off, false);
  off += 2;

  const totalRecords = Math.abs(layerCountRaw);
  if (totalRecords > 100_000) return null;

  let visibleNonEmpty = 0;

  for (let i = 0; i < totalRecords; i++) {
    if (off + 16 + 2 > u8.length) return null;
    const top = dv.getInt32(off, false);
    off += 4;
    const left = dv.getInt32(off, false);
    off += 4;
    const bottom = dv.getInt32(off, false);
    off += 4;
    const right = dv.getInt32(off, false);
    off += 4;

    const numCh = dv.getUint16(off, false);
    off += 2;
    if (numCh > 10_000) return null;

    const chBlock = 6 * numCh;
    if (off + chBlock + 4 + 4 + 1 + 1 + 1 + 1 + 4 > u8.length) return null;
    off += chBlock;

    off += 4;
    off += 4;
    off += 1;
    off += 1;
    const flags = u8[off];
    off += 1;
    off += 1;

    const extraSize = dv.getUint32(off, false);
    off += 4;
    if (extraSize < 0 || off + extraSize > u8.length) return null;
    off += extraSize;

    const width = right - left;
    const height = bottom - top;
    const nonEmpty = width > 0 && height > 0;
    const visible = (flags & 0x02) === 0;
    if (nonEmpty && visible) visibleNonEmpty++;
  }

  if (off > layerInfoEnd) return null;
  off = layerInfoEnd;

  if (off > layerAndMaskEnd) return null;

  return visibleNonEmpty;
}
