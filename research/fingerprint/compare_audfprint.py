"""Comparison only, not part of the product: the same 30 composed songs and
edited posts, searched with audfprint (MIT, Shazam-style landmarks,
github.com/dpwe/audfprint) and with Bekvor's recognition. Right song on top, per edit.

    git clone https://github.com/dpwe/audfprint /tmp/audfprint   # and: pip install docopt joblib psutil
    AUDFPRINT_DIR=/tmp/audfprint python3 research/fingerprint/compare_audfprint.py
"""
import sys, os, subprocess, json
sys.path.insert(0,'services/recognizer'); sys.argv=['x']
import numpy as np, soundfile as sf, bekvor_fp as fp, scale_bench as sb
from bench import ff, make_voice, mix_db
from synth import SR, make_song
AF=os.environ["AUDFPRINT_DIR"]; W=os.environ.get("WORK_DIR", "/tmp/bekvor-audfprint"); os.makedirs(W, exist_ok=True)
N=30
refs=[]
for s in range(1,N+1):
    p=f"{W}/song-{s}.wav"
    if not os.path.exists(p): sf.write(p, sb.song_audio(s), fp.FS)
    refs.append(p)
db=f"{W}/db.pklz"
if not os.path.exists(db):
    subprocess.run([sys.executable, f"{AF}/audfprint.py","new","--dbase",db,"--density","40","--samplerate","8000"]+refs, check=True, capture_output=True)
edits={'clean':lambda c,i:c,'voice -6':lambda c,i: mix_db(c, make_voice(i+99, len(c)/SR+1), -6),
 'sped 1.25':lambda c,i: ff(c, f"asetrate={int(SR*1.25)},aresample={SR}"),
 'slowed 0.85':lambda c,i: ff(c, f"asetrate={int(SR*0.85)},aresample={SR}"),
 'tempo 1.2 pitch kept':lambda c,i: ff(c,"rubberband=tempo=1.2"),
 'pitch -3 st':lambda c,i: ff(c,"rubberband=pitch=0.84090")}
idx=fp.Index([(f"song-{s}", fp.fingerprint(sb.song_audio(s))) for s in range(1,N+1)])
rng=np.random.default_rng(3); res={}
for i in range(1,N+1):
    x=make_song(i, sb.SONG_SEC); L=rng.uniform(20,40); st=rng.uniform(3, sb.SONG_SEC-L*1.3-3)
    clip=x[int(st*SR):int((st+L*1.3)*SR)]
    for name,e in edits.items():
        y=sb.to_fs(e(clip,i)[:int(L*SR)]); q=f"{W}/q.wav"; sf.write(q,y,fp.FS)
        out=subprocess.run([sys.executable, f"{AF}/audfprint.py","match","--dbase",db,"--density","40","--samplerate","8000",q],capture_output=True,text=True).stdout
        af = f"song-{i}.wav" in out.split("Matched")[1].split(" as ")[1] if "Matched" in out else False
        r=fp.match(idx,y); bk = bool(r['candidates']) and r['candidates'][0]['trackId']==f"song-{i}"
        d=res.setdefault(name,{'audfprint':0,'bekvor':0}); d['audfprint']+=af; d['bekvor']+=bk
print(json.dumps(res))
