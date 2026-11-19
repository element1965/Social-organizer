import { copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openSync } from 'fontkit';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const web = join(root, 'apps/web');
const publicDir = join(web, 'public');
const android = join(web, 'android/app/src/main/res');
const ios = join(web, 'ios/App/App/Assets.xcassets');

// Match BrandMark.tsx and Logo.tsx, including the transparent padding in logo.png.
const care = '#087f71';
const logoScale = 0.68;
const cornerScale = 0.29;
const logo = join(publicDir, 'logo.png');
const scene = '#0b1513';
// The light boot canvas in apps/web/index.html.
const canvas = '#f3f6f4';

function ground(width, height, background) {
  return sharp({ create: { width, height, channels: 4, background } });
}

function fish(width) {
  return sharp(logo).resize({ width }).png().toBuffer();
}

async function tile(size, { radius = Math.round(size * cornerScale) } = {}) {
  const shape = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" rx="${radius}" fill="${care}"/></svg>`,
  );
  return sharp(shape).composite([{ input: await fish(Math.round(size * logoScale)) }]).png().toBuffer();
}

async function splash(path, width, height, size) {
  await ground(width, height, canvas).composite([{ input: await tile(size) }])
    .removeAlpha().png().toFile(path);
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

async function socialPreview() {
  const width = 1200;
  const height = 630;
  const size = 200;
  const gap = 40;
  // Outline the bundled font so rendering never depends on system font discovery.
  const font = openSync(join(publicDir, 'fonts/manrope-latin.woff2'));
  // The bundled Manrope is variable with its default instance at weight 200, and fontkit cannot instance a
  // WOFF2; a same-colour stroke thickens the outlines to about bold so the name reads in small previews
  const embolden = Math.round(font.unitsPerEm * 0.06);
  const { glyphs, positions } = font.layout('Social Organizer');
  let advance = 0;
  const letters = glyphs.map((glyph, index) => {
    const { xAdvance, xOffset, yOffset } = positions[index];
    const path = `<path transform="translate(${advance + xOffset} ${yOffset})" d="${glyph.path.toSVG()}"/>`;
    advance += xAdvance;
    return path;
  });
  const scale = 84 / font.unitsPerEm;
  const preview = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<g fill="${canvas}" stroke="${canvas}" stroke-width="${embolden}" stroke-linejoin="round" transform="translate(${(width - advance * scale) / 2} 415) scale(${scale} ${-scale})">`
    + `${letters.join('')}</g></svg>`,
  );
  const title = await sharp(preview).trim({ background: 'transparent' }).png()
    .toBuffer({ resolveWithObject: true });
  const top = Math.floor((height - size - gap - title.info.height) / 2);
  await ground(width, height, scene).composite([
    { input: await tile(size), top, left: (width - size) / 2 },
    { input: title.data, top: top + size + gap, left: Math.floor((width - title.info.width) / 2) },
  ]).removeAlpha().png().toFile(join(publicDir, 'og-image.png'));
}

async function webIcons() {
  await writeFile(join(publicDir, 'favicon.ico'), await favicon());
  await writeFile(join(publicDir, 'apple-touch-icon.png'), await tile(180, { radius: 0 }));
  for (const size of [192, 512]) {
    await writeFile(join(publicDir, `icon-${size}.png`), await tile(size));
  }
  // The 68%-wide fish fits wholly inside the circle with a radius of 40%.
  await writeFile(join(publicDir, 'icon-maskable-512.png'), await tile(512, { radius: 0 }));
  await writeFile(join(publicDir, 'push-badge.png'),
    await ground(96, 96, 'transparent').composite([{ input: await fish(96) }]).png().toBuffer());
  await socialPreview();
}

async function androidIcons() {
  // Keep the existing density-specific resource sizes and splash layout.
  const densities = [
    ['mdpi', 1, 480, 320, 64],
    ['hdpi', 1.5, 800, 480, 96],
    ['xhdpi', 2, 1280, 720, 96],
    ['xxhdpi', 3, 1600, 960, 128],
    ['xxxhdpi', 4, 1920, 1280, 128],
  ];
  for (const [density, multiplier, width, height, splashTile] of densities) {
    const mipmap = join(android, `mipmap-${density}`);
    const size = 48 * multiplier;
    const layer = 108 * multiplier;
    await writeFile(join(mipmap, 'ic_launcher.png'), await tile(size));
    await writeFile(join(mipmap, 'ic_launcher_round.png'), await tile(size, { radius: size / 2 }));
    // Android shows 72dp of the 108dp layer. Scale to that viewport so the
    // fish matches the other tiles and fits inside Android's central 66dp safe zone.
    const foreground = await fish(Math.round(72 * multiplier * logoScale));
    await ground(layer, layer, 'transparent').composite([{ input: foreground }])
      .png().toFile(join(mipmap, 'ic_launcher_foreground.png'));
    await splash(join(android, `drawable-land-${density}/splash.png`), width, height, splashTile);
    await splash(join(android, `drawable-port-${density}/splash.png`), height, width, splashTile);
  }
  await copyFile(join(android, 'drawable-land-mdpi/splash.png'), join(android, 'drawable/splash.png'));
  await writeFile(join(android, 'drawable/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n`
    + `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n`
    + `    <solid android:color="${care}" />\n</shape>\n`);
}

async function iosIcons() {
  const iconPath = join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png');
  await sharp(await tile(1024, { radius: 0 })).removeAlpha().png().toFile(iconPath);
  await copyFile(iconPath, join(web, 'resources/icon.png'));
  const splashDir = join(ios, 'Splash.imageset');
  const splashPath = join(splashDir, 'splash-2732x2732.png');
  // The storyboard aspect-fills the square canvas. A 240px tile is about
  // 66pt on a 750pt-tall phone, matching the web loader's tile.
  await splash(splashPath, 2732, 2732, 240);
  for (const suffix of ['-1', '-2']) {
    await copyFile(splashPath, join(splashDir, `splash-2732x2732${suffix}.png`));
  }
}

await webIcons();
await androidIcons();
await iosIcons();
// Play applies the mask and expects a 32-bit sRGB PNG, including an alpha channel.
await writeFile(join(root, 'play-store-assets/icon-512.png'), await tile(512, { radius: 0 }));
