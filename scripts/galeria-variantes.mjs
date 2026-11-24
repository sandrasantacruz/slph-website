// Erzeugt für jedes Galerie-Bild die leichten Varianten «-640.webp» und
// «-960.webp» (WebP Q80), die `srcset()` aus src/lib/srcset.ts einsammelt.
// Ohne sie lädt jede Kachel das 1500-px-Original, auf dem Handy also das
// Vierfache des Nötigen. Vorhandene Varianten bleiben unangetastet.
//
//   pnpm galeria:variantes
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BASE = path.resolve('public/assets/galeria');
let neu = 0;
for (const dir of fs.readdirSync(BASE)) {
  const abs = path.join(BASE, dir);
  if (!fs.statSync(abs).isDirectory()) continue;
  for (const file of fs.readdirSync(abs)) {
    if (!file.endsWith('.webp') || /-(640|960)\.webp$/.test(file)) continue;
    const src = path.join(abs, file);
    const { width } = await sharp(src).metadata();
    for (const w of [640, 960]) {
      const out = src.replace(/\.webp$/, `-${w}.webp`);
      if (w >= width || fs.existsSync(out)) continue;
      await sharp(src).resize({ width: w }).webp({ quality: 80 }).toFile(out);
      neu++;
    }
  }
}
console.log(`${neu} variantes nuevas`);
