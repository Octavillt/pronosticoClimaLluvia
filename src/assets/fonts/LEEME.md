# Fuentes autoalojadas

Archivos `woff2` del subconjunto **latin** (cubre español, `−`, `·`, `…`, `›`), descargados de Google Fonts el 2026-10-01
y servidos desde el propio sitio: la app no pide nada a servidores de tipografías.

| Archivo | Familia | Pesos | Tamaño | sha256 |
|---|---|---|---|---|
| `bricolage-grotesque-latin.woff2` | Bricolage Grotesque (variable, ejes `opsz` y `wght`) | 700–800 | 76 868 B | `85f55a58a31e61a2e19e8bb25fed503181bf2a6b4cab76c589992cfaac377447` |
| `figtree-latin.woff2` | Figtree (variable, eje `wght`) | 400–700 | 20 184 B | `8330490a01c60c196eae00b823de8102275aaa5862e7b76a7af21b8745338928` |

Bricolage conserva el eje de tamaño óptico (`opsz`): el número grande de la pantalla usa el diseño de exhibición y los
títulos pequeños el de texto, igual que en las maquetas aprobadas. Sin ese eje el archivo pesaría la mitad, pero el "72"
se vería distinto.

Licencia: SIL Open Font License 1.1. Los textos completos están en `public/licencias/` y salen en el sitio publicado.
Para verificar un archivo: `shasum -a 256 src/assets/fonts/*.woff2` y comparar con la tabla; los primeros cuatro bytes
deben ser `wOF2`.
