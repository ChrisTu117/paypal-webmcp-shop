# Narration with Kokoro-82M (ONNX, local, Apache-2.0). Voice af_heart (highest-rated Kokoro English voice).
import json, sys, soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
k = Kokoro('voices/kokoro-v1.0.onnx', 'voices/voices-v1.0.bin')
S = json.load(open('script.json'))
for s in S:
    t = s['text'].replace('GLM 4.7 Flash', 'G L M 4.7 Flash')
    a, sr = k.create(t, voice=sys.argv[1] if len(sys.argv) > 1 else 'af_heart', speed=1.0, lang='en-us')
    a = np.concatenate([a, np.zeros(int(sr * 0.1), dtype=a.dtype)])
    sf.write(f"{s['id']}.wav", a, sr); s['audio'] = round(len(a) / sr, 2); s['dur'] = round(s['audio'] + 0.9, 2)
json.dump(S, open('script.json', 'w'), indent=1)
print([(s['id'], s['dur']) for s in S], round(sum(s['dur'] for s in S), 1))
