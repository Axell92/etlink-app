#!/usr/bin/env python3
"""index.html 빌드.
  python3 src/build.py            -> index.html (배포용, API_URL 포함, 시드 없음)
  python3 src/build.py --preview  -> preview.html (API 없이 시드 데이터로 동작, 미리보기용)
"""
import json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
API_URL = 'https://script.google.com/macros/s/AKfycbxBdyutkRMEmHY1N3GLyxkonW2s3XjBdpi86ztCiIcK64VnsbKY0yqZu-NhGI2-qHYU_w/exec'
t = (SRC / 'Index.template.html').read_text(encoding='utf-8')
if '--preview' in sys.argv:
    seed = (SRC / 'seed_min.json').read_text(encoding='utf-8').strip()
    pseed = (SRC / 'people_seed.json').read_text(encoding='utf-8').strip()
    sseed = json.dumps(json.load(open(SRC / 'standards' / 'standards.json', encoding='utf-8')), ensure_ascii=False, separators=(',', ':'))
    out = t.replace('__SEED__', seed).replace('__PSEED__', pseed).replace('__SSEED__', sseed).replace('__API_URL__', '')
    (ROOT / 'preview.html').write_text(out, encoding='utf-8'); print('preview.html')
else:
    out = t.replace('__SEED__', '[]').replace('__PSEED__', '[]').replace('__SSEED__', '[]').replace('__API_URL__', API_URL)
    (ROOT / 'index.html').write_text(out, encoding='utf-8'); print('index.html')
