/**
 * Parses a classic PSD (version 1) and returns the count of leaf content layers.
 *
 * Count rule:
 * - visible ((flags & 0x02) === 0)
 * - no lsct/lsdk section info tag present
 *
 * Excludes:
 * - hidden layers (flags bit 0x02)
 * - group/folder layers (lsct type 1 or 2)
 * - section divider markers (lsct type 3)
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

  let finalLeafCount = 0;
  let hiddenExcluded = 0;
  let groupFolderExcluded = 0;
  let sectionDividerExcluded = 0;

  const readAscii = (start: number, len: number) => {
    let out = "";
    for (let i = 0; i < len; i++) out += String.fromCharCode(u8[start + i]);
    return out;
  };

  for (let i = 0; i < totalRecords; i++) {
    if (off + 16 + 2 > u8.length) return null;
    off += 16;

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
    const extraStart = off;
    const extraEnd = off + extraSize;

    if (off + 4 > extraEnd) return null;
    const layerMaskDataLen = dv.getUint32(off, false);
    off += 4;
    if (off + layerMaskDataLen > extraEnd) return null;
    off += layerMaskDataLen;

    if (off + 4 > extraEnd) return null;
    const blendingRangesLen = dv.getUint32(off, false);
    off += 4;
    if (off + blendingRangesLen > extraEnd) return null;
    off += blendingRangesLen;

    if (off + 1 > extraEnd) return null;
    const nameLen = u8[off];
    off += 1;
    if (off + nameLen > extraEnd) return null;
    off += nameLen;
    const namePad = (4 - ((1 + nameLen) % 4)) % 4;
    if (off + namePad > extraEnd) return null;
    off += namePad;

    let sectionType: number | null = null;
    while (off + 12 <= extraEnd) {
      const sig = readAscii(off, 4);
      off += 4;
      const key = readAscii(off, 4);
      off += 4;
      let dataLen = dv.getUint32(off, false);
      off += 4;
      if (sig !== "8BIM" && sig !== "8B64") {
        if (off + dataLen > extraEnd) return null;
        off += dataLen;
        if (dataLen % 2 !== 0) off += 1;
        continue;
      }
      if (off + dataLen > extraEnd) return null;
      if ((key === "lsct" || key === "lsdk") && dataLen >= 4) {
        sectionType = dv.getUint32(off, false);
      }
      off += dataLen;
      if (dataLen % 2 !== 0 && off < extraEnd) off += 1;
    }

    off = extraEnd;

    const isHidden = (flags & 0x02) !== 0;
    const hasSectionTag = sectionType !== null;
    const isGroupFolder = sectionType === 1 || sectionType === 2;
    const isSectionDivider = sectionType === 3;

    if (isHidden) {
      hiddenExcluded++;
      continue;
    }
    if (isGroupFolder) {
      groupFolderExcluded++;
      continue;
    }
    if (isSectionDivider) {
      sectionDividerExcluded++;
      continue;
    }
    if (hasSectionTag) {
      continue;
    }
    finalLeafCount++;

    // Guard: ensure parser never moved before start.
    if (off < extraStart) return null;
  }

  if (off > layerInfoEnd) return null;
  off = layerInfoEnd;

  if (off > layerAndMaskEnd) return null;

  // eslint-disable-next-line no-console
  console.log("[psd-layer-count] breakdown", {
    totalRawLayersInPsd: totalRecords,
    hiddenLayersExcluded: hiddenExcluded,
    groupFolderLayersExcluded: groupFolderExcluded,
    sectionDividerMarkersExcluded: sectionDividerExcluded,
    finalCount: finalLeafCount,
  });

  return finalLeafCount;
}
