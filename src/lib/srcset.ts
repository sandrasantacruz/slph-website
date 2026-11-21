import fs from 'node:fs';
import path from 'node:path';

/**
 * `srcset` con las versiones ligeras «-640.webp» y «-960.webp» (si existen en
 * public/) y la original. Así el móvil descarga una más pequeña y el ordenador
 * la grande. Las variantes se generan a mano (WebP Q80).
 */
export function srcset(src: string, width: number): string | undefined {
  if (!src.endsWith('.webp')) return undefined;
  const existe = (p: string) => fs.existsSync(path.join(process.cwd(), 'public', p));
  const partes: string[] = [];
  for (const w of [640, 960]) {
    const v = src.replace(/\.webp$/, `-${w}.webp`);
    if (w < width && existe(v)) partes.push(`${v} ${w}w`);
  }
  if (!partes.length) return undefined;
  return [...partes, `${src} ${width}w`].join(', ');
}
