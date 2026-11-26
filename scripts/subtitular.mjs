// Graba subtítulos en un vídeo con el estilo de la web (CLAUDE.md, «Vídeos: Untertitel-Stil»):
// una línea, Varela Round blanca, franja gris translúcida casi a lo ancho, abajo.
// Uso: node scripts/subtitular.mjs entrada.mp4 subtitulos.vtt salida.mp4
// El texto de cada vídeo está en public/videos/subtitulos/*.vtt (para poder volver a grabarlo).
import sharp from 'sharp'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const [src, vtt, dst] = process.argv.slice(2);
const FONT = 'node_modules/@fontsource/varela-round/files/varela-round-latin-400-normal.woff';
const [W, H] = execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0', src]).toString().trim().split(',').map(Number);
const k = W / 1280, vertical = H > W;
// vídeos verticales: letra mayor, porque en la web se ven estrechos (unos 290 px)
const fs_ = Math.round(vertical ? W/16 : 31*k), BH = Math.round(fs_*1.62), BX = Math.round(W*0.03);
// SUB_DERECHA=px: margen derecho mayor si el vídeo trae algo abajo a la derecha (p. ej. el círculo de Noa en la radio)
const BXR = Number(process.env.SUB_DERECHA || BX);
const MAX = Math.floor((W - BX - BXR) * 0.9 / (fs_*0.56));
const ts = s => { const p=s.split(':').map(Number); return p.length===3? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1]; };
const cues=[];
for (const b of fs.readFileSync(vtt,'utf8').split(/\n\n+/).filter(b=>b.includes('-->'))) {
  const [tl, ...ls] = b.trim().split('\n'); const [a,z] = tl.split('-->').map(x=>ts(x.trim()));
  // una sola línea; si no cabe, se parte en dos subtítulos seguidos por el espacio más centrado
  const parts=[]; const split=t=>{ if (t.length<=MAX) return parts.push(t); const m=t.length/2; let best=-1;
    for (let i=0;i<t.length;i++) if (t[i]===' ' && (best<0 || Math.abs(i-m)<Math.abs(best-m))) best=i; split(t.slice(0,best)); split(t.slice(best+1)); };
  split(ls.join(' '));
  const tot=parts.join('').length; let t=a;
  parts.forEach((p,i)=>{ const d=(z-a)*p.length/tot; cues.push({text:p,a:t,z:i===parts.length-1?z:t+d}); t+=d; });
}
// Sin parpadeo: si entre dos subtítulos hay menos de 1,2 s, el primero se queda hasta
// que entra el siguiente. La franja gris es una sola mientras dura un bloque de habla
// (solo cambia el texto), como en los vídeos montados a mano.
cues.sort((x,y)=>x.a-y.a);
for (let i=0;i<cues.length-1;i++) if (cues[i+1].a - cues[i].z < 1.2) cues[i].z = cues[i+1].a;
const bloques=[]; for (const c of cues) { const l=bloques[bloques.length-1]; if (l && c.a - l.z < 0.01) l.z=c.z; else bloques.push({a:c.a,z:c.z}); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'subs-')); const ins=[];
for (const [i,c] of cues.entries()) {
  const esc=c.text.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const txt = await sharp({ text:{ text:`<span foreground="white">${esc}</span>`, font:`Varela Round ${fs_}`, fontfile:FONT, rgba:true, dpi:72 } }).png().toBuffer();
  const m = await sharp(txt).metadata();
  const bw=W-BX-BXR, band=Buffer.from(`<svg width="${bw}" height="${BH}"><rect width="${bw}" height="${BH}" fill-opacity="0"/></svg>`);
  const f=path.join(dir,`c${i}.png`);
  await sharp(band).composite([{input:txt,left:Math.max(0,Math.round((bw-m.width)/2)),top:Math.round((BH-m.height)/2)}]).png().toFile(f);
  ins.push({f,a:c.a,z:c.z});
}
const y = Math.round(H - BH - H*0.035);
const fband=path.join(dir,'franja.png'); const bwid=W-BX-BXR;
await sharp(Buffer.from(`<svg width="${bwid}" height="${BH}"><rect width="${bwid}" height="${BH}" fill="rgb(35,35,35)" fill-opacity="0.55"/></svg>`)).png().toFile(fband);
const capas=[...bloques.map(b=>({f:fband,a:b.a,z:b.z})), ...ins];
const args=['-v','error','-y','-i',src]; capas.forEach(c=>args.push('-i',c.f));
let chain='[0:v]'; const fc=capas.map((c,i)=>{ const o=i<capas.length-1?`[v${i}]`:'[vout]'; const s=`${chain}[${i+1}:v]overlay=x=${BX}:y=${y}:enable='between(t,${c.a.toFixed(3)},${c.z.toFixed(3)})'${o}`; chain=o; return s; });
args.push('-filter_complex',fc.join(';'),'-map','[vout]','-map','0:a?','-c:v','libx264','-preset','slow','-crf','25','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',dst);
execFileSync('ffmpeg',args,{stdio:'inherit'});
console.log(path.basename(dst), `${cues.length} subtítulos, letra ${fs_}px, máx. ${MAX} caracteres`);
