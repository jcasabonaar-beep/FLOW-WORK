"""Genera index.html (página completa) y, opcionalmente, una versión sin <!doctype> para publicar como Artifact.

Uso: python3 build.py [ruta_artifact.html]
"""
import pathlib, sys

root = pathlib.Path(__file__).parent
data = "\n".join((root / "data" / f).read_text(encoding="utf-8") for f in ["t1.js", "t2.js", "t3.js", "t4.js", "t8.js"])
body = (root / "app.template.html").read_text(encoding="utf-8").replace("/*__DATA__*/", data)

full = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '</head>\n<body>\n' + body + '\n</body>\n</html>\n')
(root / "index.html").write_text(full, encoding="utf-8")
if len(sys.argv) > 1:
    pathlib.Path(sys.argv[1]).write_text(body, encoding="utf-8")
print("ok", len(full), "bytes")
