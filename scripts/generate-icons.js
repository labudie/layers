/**
 * Resizes the Layers logo into PWA / Apple touch icon sizes.
 * Run: npm run icons
 * Default source: public/layers-lockup.svg (override: node scripts/generate-icons.js <path>)
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const publicDir = path.join(__dirname, "..", "public");
const defaultSource = path.join(publicDir, "layers-lockup.svg");

const sourcePath = path.resolve(
  process.argv[2] || process.env.ICON_SOURCE || defaultSource
);

if (!fs.existsSync(sourcePath)) {
  console.error(
    "Missing source image. Add your logo as public/layers-lockup.svg or pass a path:\n" +
      "  node scripts/generate-icons.js path/to/logo.png"
  );
  process.exit(1);
}

const outputs = [
  { size: 512, name: "icon-512.png" },
  { size: 192, name: "icon-192.png" },
  { size: 180, name: "layers-icon-192.svg" },
];

async function main() {
  for (const { size, name } of outputs) {
    const outPath = path.join(publicDir, name);
    await sharp(sourcePath)
      .rotate()
      .resize(size, size, { fit: "cover", position: "centre" })
      .png()
      .toFile(outPath);
    console.log("Wrote", outPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
