import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';

const publicDir = fileURLToPath(new URL('../apps/web/public/', import.meta.url));
// Match the design tokens: light canvas for install, dark scene for the brand tile.
const scene = '#0b1513';
const canvas = '#f3f6f4';

async function tile(size, fraction = 0.74, logo = 'logo.png', background = scene) {
  const markSize = Math.round(size * fraction);
  const mark = await sharp(join(publicDir, logo)).trim()
    .resize(markSize, markSize, { fit: 'contain', background: 'transparent' })
    .png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark }]).png().toBuffer();
}

// ICO directory entries can point to complete PNG images.
async function favicon() {
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map((size) => tile(size)));
  const directory = Buffer.alloc(6 + 16 * sizes.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  for (const [index, image] of images.entries()) {
    const entry = 6 + index * 16;
    directory[entry] = sizes[index];
    directory[entry + 1] = sizes[index];
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  }
  return Buffer.concat([directory, ...images]);
}

const badge = sharp(join(publicDir, 'logo.png')).trim()
  .resize(96, 96, { fit: 'contain', background: 'transparent' }).png();

await Promise.all([
  favicon().then((data) => writeFile(join(publicDir, 'favicon.ico'), data)),
  tile(180, 0.74, 'logo-dark.png', canvas).then((data) => writeFile(join(publicDir, 'apple-touch-icon.png'), data)),
  tile(192).then((data) => writeFile(join(publicDir, 'icon-192.png'), data)),
  tile(512).then((data) => writeFile(join(publicDir, 'icon-512.png'), data)),
  // A centered 55% square fits within the circular maskable safe zone.
  tile(512, 0.55).then((data) => writeFile(join(publicDir, 'icon-maskable-512.png'), data)),
  badge.toFile(join(publicDir, 'push-badge.png')),
]);
