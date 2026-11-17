"""Arma app/index.html a partir de src/template.html + src/base.css + data/seed.json.
Uso:  python tools/build.py
"""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
html = (root/'src/template.html').read_text(encoding='utf-8')
html = html.replace('/*__CSS__*/', (root/'src/base.css').read_text(encoding='utf-8'))
html = html.replace('__SEED__', (root/'data/seed.json').read_text(encoding='utf-8'))
(root/'app/index.html').write_text(html, encoding='utf-8')
print('OK -> app/index.html')
