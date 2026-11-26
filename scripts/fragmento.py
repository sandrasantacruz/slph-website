# Corta un vídeo en tramos (inicio:fin) y adapta su .vtt a los tiempos nuevos.
# Uso: python3 scripts/fragmento.py entrada.mp4 completo.vtt salida.mp4 salida.vtt a:b a:b …
import subprocess, sys, re
src, vin, dst, vout, *segs = sys.argv[1:]
segs = [tuple(map(float, s.split(':'))) for s in segs]
fc, ins = [], ''
for i, (a, b) in enumerate(segs):
    d = b - a
    fc.append(f"[0:v]trim={a}:{b},setpts=PTS-STARTPTS[v{i}];[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.08,afade=t=out:st={d-0.12:.3f}:d=0.12[a{i}]")
    ins += f"[v{i}][a{i}]"
fc.append(f"{ins}concat=n={len(segs)}:v=1:a=1[v][a]")
subprocess.run(['ffmpeg','-v','error','-y','-i',src,'-filter_complex',';'.join(fc),'-map','[v]','-map','[a]','-c:v','libx264','-preset','slow','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',dst], check=True)
ts = lambda x: int(x.split(':')[0])*60 + float(x.split(':')[1])
fm = lambda t: f"{int(t//60):02d}:{t%60:06.3f}"
out = ['WEBVTT']
for b in open(vin).read().strip().split('\n\n')[1:]:
    tl, *tx = b.split('\n'); a, z = [ts(x.strip()) for x in tl.split('-->')]
    off = 0
    for (sa, sb) in segs:
        if a >= sa - 0.3 and a < sb - 0.3:
            na, nz = off + max(a, sa) - sa, off + min(z, sb) - sa
            out.append(f"{fm(na)} --> {fm(nz)}\n" + '\n'.join(tx)); break
        off += sb - sa
open(vout, 'w').write('\n\n'.join(out) + '\n')
print(dst, round(sum(b - a for a, b in segs), 1), 's,', len(out) - 1, 'subtítulos')
