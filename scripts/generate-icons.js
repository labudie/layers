/**
 * Generates PWA / iOS-style app icons: layered rounded rectangles (Shortcuts-inspired).
 * Run: node scripts/generate-icons.js
 * Requires: npm install canvas (devDependency)
 */

const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

const BG = "#0f0520";
const LAYER_COLORS = ["#4c1d95", "#6d28d9", "#7c3aed", "#a855f7"];
const LAYER_ALPHA = 0.9;

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** iOS-like rounded rect (circular corners, not true squircle). */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const outerR = size * 0.2237;

  // Background: fully rounded square
  roundRectPath(ctx, 0, 0, size, size, outerR);
  ctx.fillStyle = BG;
  ctx.fill();

  // Portrait cards: width < height
  const cardW = size * 0.36;
  const cardH = size * 0.58;
  const cardR = size * 0.065;
  const stepX = size * 0.068;
  const stepY = -size * 0.054;

  // Bottom layer anchored toward bottom-left; each step moves up-right
  let x = size * 0.11;
  let y = size * 0.26;

  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.42)";
    ctx.shadowBlur = Math.max(2, size * 0.028);
    ctx.shadowOffsetX = size * 0.014;
    ctx.shadowOffsetY = size * 0.018;
    roundRectPath(ctx, x, y, cardW, cardH, cardR);
    ctx.fillStyle = hexToRgba(LAYER_COLORS[i], LAYER_ALPHA);
    ctx.fill();
    ctx.restore();

    x += stepX;
    y += stepY;
  }

  return canvas;
}

function writePng(canvas, outPath) {
  const buf = canvas.toBuffer("image/png");
  fs.writeFileSync(outPath, buf);
  console.log("Wrote", outPath);
}

const publicDir = path.join(__dirname, "..", "public");

const outputs = [
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
  { size: 180, name: "apple-touch-icon.png" },
];

for (const { size, name } of outputs) {
  const canvas = drawIcon(size);
  writePng(canvas, path.join(publicDir, name));
}
