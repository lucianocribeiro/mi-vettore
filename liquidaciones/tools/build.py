"""Arma app/index.html a partir de src/template.html + src/base.css + seed.

Por defecto usa data/seed.json vacío (sin PII) para no publicar datos reales
en frontend/public/liq-embed. Para demos locales con histórico:
  LIQ_SEED=data/seed.full.json python tools/build.py
"""
import os
from pathlib import Path

root = Path(__file__).resolve().parent.parent
seed_rel = os.environ.get("LIQ_SEED", "data/seed.json")
seed_path = root / seed_rel
if not seed_path.is_file():
    raise SystemExit(f"Seed no encontrado: {seed_path}")
html = (root / "src/template.html").read_text(encoding="utf-8")
html = html.replace("/*__CSS__*/", (root / "src/base.css").read_text(encoding="utf-8"))
html = html.replace("__SEED__", seed_path.read_text(encoding="utf-8"))
(root / "app/index.html").write_text(html, encoding="utf-8")
print(f"OK -> app/index.html (seed={seed_rel})")
