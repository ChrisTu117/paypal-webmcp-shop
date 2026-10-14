# Compose out/demo.mp4: raw Playwright recording + narration wavs placed at scene marks + burned subtitles.
import json, re, subprocess
S = json.load(open('script.json')); M = json.load(open('marks.json')); raw = {m['id']: m['start'] for m in M['marks']}
# scenes whose browser actions ran longer than the narration (e.g. PayPal login) are sped up to fit
ends = [m.get('end') for m in M['marks']]; seg, st, t = [], {}, 0.0
for s, e in zip(S, ends):
    L = e - raw[s['id']]; out = min(L, s['dur']) if L > s['dur'] * 1.05 else L
    seg.append((raw[s['id']], e, out / L)); st[s['id']] = t; t += out
TOTAL = t
def ts(t): return f"{int(t//3600):02}:{int(t%3600//60):02}:{t%60:06.3f}".replace('.', ',')
srt, n = [], 0
for s in S:
    parts = []
    for x in [x for x in re.split(r'(?<=[.!?:])\s+', s['text']) if x]:
        while len(x) > 80 and ',' in x[20:]:
            i = x.index(',', 20) + 1; parts.append(x[:i]); x = x[i:].strip()
        parts.append(x)
    tot = sum(len(p) for p in parts); t = st[s['id']] + 0.15
    for p in parts:
        d = s['audio'] * len(p) / tot; n += 1; srt.append(f"{n}\n{ts(t)} --> {ts(t + d)}\n{p}\n"); t += d
open('subs.srt', 'w').write('\n'.join(srt))
inputs, flt = ['-i', M['video']], []
for i, s in enumerate(S):
    inputs += ['-i', f"{s['id']}.wav"]; ms = int((st[s['id']] + 0.15) * 1000); flt.append(f"[{i+1}:a]adelay={ms}|{ms}[a{i}]")
flt.append(''.join(f'[a{i}]' for i in range(len(S))) + f"amix=inputs={len(S)}:normalize=0,apad[aout]")
vf = ''.join(f"[0:v]trim={a}:{b},setpts=(PTS-STARTPTS)*{f}[v{i}];" for i, (a, b, f) in enumerate(seg))
flt.append(vf + ''.join(f'[v{i}]' for i in range(len(seg))) + f"concat=n={len(seg)}:v=1:a=0[vc]")
flt.append("[vc]fps=30,subtitles=subs.srt:force_style='FontName=DejaVu Sans,FontSize=20,PrimaryColour=&H00FFFFFF,BorderStyle=3,Outline=1,Shadow=0,BackColour=&H99000000,MarginV=24'[vout]")
subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(flt), '-map', '[vout]', '-map', '[aout]', '-t', str(round(TOTAL, 2)),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '../out/demo.mp4'], check=True)
print('out/demo.mp4 ok')
