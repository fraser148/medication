import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));

// SVG with pill/capsule icon on blue background
const createIconSvg = (size: number) => {
  const pillWidth = size * 0.25;
  const pillHeight = size * 0.55;
  const centerX = size / 2;
  const centerY = size / 2;
  const cornerRadius = pillWidth / 2;

  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Blue background -->
  <rect width="${size}" height="${size}" fill="#3b82f6" rx="${size * 0.15}"/>

  <!-- Pill shape (rotated 45 degrees) -->
  <g transform="rotate(-45 ${centerX} ${centerY})">
    <!-- Full pill outline -->
    <rect
      x="${centerX - pillWidth / 2}"
      y="${centerY - pillHeight / 2}"
      width="${pillWidth}"
      height="${pillHeight}"
      rx="${cornerRadius}"
      fill="white"
    />
    <!-- Top half (darker) -->
    <rect
      x="${centerX - pillWidth / 2}"
      y="${centerY - pillHeight / 2}"
      width="${pillWidth}"
      height="${pillHeight / 2}"
      fill="#e5e7eb"
    />
    <!-- Round top of pill -->
    <ellipse
      cx="${centerX}"
      cy="${centerY - pillHeight / 2 + cornerRadius}"
      rx="${cornerRadius}"
      ry="${cornerRadius}"
      fill="#e5e7eb"
    />
  </g>
</svg>`.trim();
};

async function generateIcons() {
  const publicDir = join(__dirname, "..", "public");

  const sizes = [192, 512];

  for (const size of sizes) {
    const svg = createIconSvg(size);
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    const outputPath = join(publicDir, `icon-${size}.png`);
    await writeFile(outputPath, pngBuffer);
    console.log(`Generated ${outputPath}`);
  }

  console.log("Icon generation complete!");
}

generateIcons().catch(console.error);
