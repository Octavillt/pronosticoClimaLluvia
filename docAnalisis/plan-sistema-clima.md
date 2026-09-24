# Plan: SistemaClima, probabilidad de lluvia en una SPA estática para Hostinger (desde cero)

> **Estado:** aprobado el 2026-09-24. **El desarrollo no ha empezado** y no se hará `git init`, scaffold, `pnpm install`, commits, push ni PRs hasta que el usuario lo indique.

## Contexto

Queremos un sistema web, solo para México, cuyo punto fuerte sea una **probabilidad de lluvia muy precisa** para la ubicación actual y las próximas horas. Lo usarán pocas personas, así que hay que validar si vale la pena pagar por datos.

**Restricción de hosting:** Hostinger solo compila con el preset **Vite** (`pnpm run build`, salida `dist`, Node 22.x, rama `master`) y sirve archivos estáticos. No hay servidor, así que toda la lógica corre en el navegador.

**Punto de partida:** repo nuevo **https://github.com/Octavillt/pronosticoClimaLluvia.git**. Se verificó con `gh` el 2026-09-24: está **vacío** y es **público**, y el repo anterior ya no existe. Se construye todo desde cero, sin reutilizar código del intento anterior (un backend Fastify incompatible con Hostinger). La carpeta local `SistemaClima/` solo tiene `docAnalisis/` vacía. Como el repo es público, nunca se sube ninguna llave: la de Google, si llega a usarse, va solo en "Variables de entorno" de Hostinger.

**Decisiones (2026-09-24):**
- Arquitectura **estática pura**: sin backend, sin push y con calibración por dispositivo.
- **React + TypeScript** sobre Vite.
- **Costo $0** en el MVP. Google Weather entra solo como fase opcional **medida** con verificación.
- Autor de commits: `Octavio <ovillafranco@gmail.com>`, configurado local en el repo.

**Fuentes verificadas hoy con curl:**

| Fuente | Estado 2026-09-24 | ¿Usable desde el navegador? |
|---|---|---|
| Open-Meteo Forecast + Ensemble | 200, `Access-Control-Allow-Origin: *`, sin llave | **Sí**: es el núcleo |
| RainViewer (radar) | Activo (13 frames pasados, **nowcast = 0**). Los tiles tienen CORS `*` | **Sí**, pero el nowcast lo calculamos nosotros |
| Cobertura de radar en México | Parcial. Cubre CDMX, GDL, MTY, Yucatán y parte del Golfo. **No** cubre Oaxaca, Guerrero ni Chiapas | Nowcast solo donde haya cobertura |
| SMN/CONAGUA `method=3` | 200, pero **sin CORS** y 7.5 MB comprimido (nacional) | **No**: queda fuera |
| Google Weather API | CORS OK; exige llave (403 sin ella) | Sí, en la fase opcional |

---

## Análisis (se escribirá en `docAnalisis/analisis-sistema-clima.md`)

**1. Meta.** Una probabilidad no puede ser "exacta", pero sí **calibrada**: si dice 70%, que llueva 7 de cada 10 veces. Definición canónica: `PoP = P(≥ 0.2 mm en la hora, en el punto)`. Se mide con Brier score y diagrama de confiabilidad. No se reenvía la PoP de una API ajena: **se calcula** a partir de miembros de ensamble.

**2. Motor en el navegador (en capas):**
1. **Ensamble (0–72 h):** Open-Meteo Ensemble, en **una sola llamada** con 5 modelos: `ecmwf_ifs025` (51 miembros), `ecmwf_aifs025` (51), `ncep_gefs_seamless` (31), `icon_global_eps` (40) y `gem_global_ensemble` (21), unos 194 miembros en total.
   - PoP por modelo = `(miembros ≥ 0.2 mm + 0.5)/(N + 1)` (suavizado de Laplace).
   - Combinación ponderada por número de miembros.
   - Si falla la llamada conjunta, se reintenta modelo por modelo y se reporta `failedModels`.
2. **Nowcast con radar (0–2 h), solo con cobertura:** se descargan los últimos frames de RainViewer (cada 10 min, zoom 7, 3×3 tiles alrededor del punto) y se decodifican a dBZ en un canvas. El vector de movimiento sale de la correlación cruzada entre frames consecutivos. Después se hace advección: **PoP_radar = fracción de píxeles ≥ 20 dBZ** en un disco aguas arriba cuyo radio crece con el horizonte. La cobertura se detecta con los tiles `coverage`.
3. **Mezcla:** `PoP = w(t)·PoP_radar + (1−w(t))·PoP_ensamble`, con `w` bajando de ~0.9 a 0 entre 0 y 3 h. Los pesos son configurables. Sin cobertura, `w = 0`.
4. **Calibración local:** en IndexedDB se guardan la PoP emitida por horizonte y lo observado. Lo observado sale del pixel de radar en el punto o del botón "¿Está lloviendo?". Con ≥150 pares por horizonte se aplica regresión isotónica (PAV); con menos, se usa la identidad.
5. **Datos complementarios:** Open-Meteo Forecast (`timezone=auto`) para temperatura, código de clima y mm por hora. Open-Meteo Geocoding (`countryCode=MX`) para la búsqueda de ciudad.

**3. Presupuesto de llamadas.** Open-Meteo gratis permite 10k/día (uso no comercial, que es este caso). La llamada de ensamble es pesada y Open-Meteo podría contarla como varias. Aun así, la caché por **geohash-5 (~4.9 km) + corrida de modelo** (~4 refrescos/día por dispositivo) alcanza para decenas de dispositivos diarios. El peso real se mide en la Fase 1.

**4. Costo.** $0: Hostinger ya está pagado y las fuentes son gratuitas. Google Weather tiene 10k llamadas/mes gratis y luego cuesta $0.15 por cada 1,000. Solo se activará si la Fase 5 demuestra una mejora de Brier medible. Otras fuentes de pago (Tomorrow.io, AccuWeather MinuteCast) no se justifican para pocos usuarios: sus llaves quedarían expuestas en un sitio estático y sus términos restringen mezclar datos.

**5. Riesgos.**
- RainViewer no tiene SLA y ya anunció un cierre en ene-2026 (sigue activo). Por eso va detrás de un adapter con degradación suave.
- La cobertura de radar es parcial.
- Safari/iOS borra IndexedDB tras ~7 días sin uso. Se mitiga con export/import JSON del historial.
- La calibración por dispositivo junta pocos datos.
- La geolocalización exige HTTPS (Hostinger ya da SSL).
- La versión de pnpm en Hostinger es desconocida (local: 12.5.1). Se valida en el deploy de la Fase 0.

**6. Fuera de alcance por ser estático:** notificaciones push, ingesta del SMN, verificación compartida entre dispositivos y blend logístico por región. Todo eso necesita servidor y se podría sumar después con un Worker gratuito.

---

## Estructura del proyecto
```
index.html
src/main.tsx, App.tsx, config.ts (import.meta.env, VITE_*)
src/domain/        types.ts, mexico.ts (polígono simplificado de MX; una bbox dejaría pasar El Paso y Guatemala)
src/providers/     http.ts (fetchJson con timeout), openMeteoEnsemble.ts, openMeteoForecast.ts, geocoding.ts, rainviewer.ts
src/nowcast/       radarDecode.ts, motion.ts, nowcastPop.ts
src/services/      ensemblePop.ts, blend.ts, calibration.ts, verificationStore.ts, cache.ts (IndexedDB), geohash.ts, forecastService.ts
src/ui/            UbicacionActual, ProbabilidadAhora, LineaDeHoras (SVG), MapaRadar (Leaflet), PanelExactitud, EstadoFuentes
tests/unit/  tests/integration/   e2e/ (+ fixtures/)
scripts/reporte-pruebas.mjs
reportes/unitarias/  reportes/e2e/  reportes/README.md (índice, el más reciente primero)
docAnalisis/analisis-sistema-clima.md, docAnalisis/flujo-ramas.md
```
**`package.json`:**
- Scripts:
  - `dev` = `vite`, `build` = `tsc -b && vite build`, `preview` = `vite preview` y `typecheck`.
  - `test` = `vitest run`.
  - `test:report` = `vitest run --coverage` (reporters `default` y `json`) seguido de `node scripts/reporte-pruebas.mjs unitarias`.
  - `test:e2e:headed` = `playwright test --headed` seguido de `node scripts/reporte-pruebas.mjs e2e`.
- `engines.node` = `>=22` y `packageManager` fijado.
- Dependencias: `react`, `react-dom`, `leaflet`.
- Dependencias de desarrollo: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `msw`, `fake-indexeddb` y `@playwright/test`.
- Página única, sin router, así que no depende de `.htaccess`.

---

## Hoja de ruta (cada fase recorre todo el pipeline y requiere VoBo)

- **Fase 0: arranque.**
  - Escribir el análisis en `docAnalisis/`.
  - Scaffold de Vite + React + TS, configuración de Vitest y Playwright, y el script de reportes.
  - Una página mínima con una prueba de humo.
  - Recorrer las 3 ramas y hacer el **primer deploy en Hostinger** para validar build, pnpm y `dist` antes de invertir en funcionalidad.
- **Fase 1: MVP con PoP por ensamble.**
  - Geolocalización, con búsqueda de ciudad como respaldo.
  - Validación de cobertura de México con polígono.
  - Motor de ensamble y caché IndexedDB por celda.
  - PoP actual y línea de próximas horas (hora local), más el estado de fuentes.
- **Fase 2: nowcast con radar** (RainViewer, dBZ, movimiento, mezcla) y mapa de radar. El esquema de color 0 (dBZ en grises) se verifica al empezar; si no sirve, se decodifica con tabla de la paleta.
- **Fase 3: verificación y calibración local** (log, botón "¿Está lloviendo?", Brier/confiabilidad, isotónica, export/import).
- **Fase 4: PWA instalable** (manifest + service worker para el shell offline).
- **Fase 5 (opcional): Google Weather.** Adapter detrás de `VITE_GOOGLE_WEATHER_KEY`, que se captura en "Variables de entorno" de Hostinger. La llave va restringida por dominio y con tope diario en GCP. Se compara en el Panel de Exactitud durante 2–4 semanas y luego se decide.

---

## Pipeline de ramas

### Acuerdos posteriores al arranque

- El usuario confirmó haber visto las pruebas E2E de Fase 1 y dio su VoBo tras la corrida `2026-09-24_1124_5f405f4` (6/6 aprobadas).
- Hostinger se conectará cuando termine el desarrollo, por decisión del usuario; el primer deploy queda pospuesto.
- Antes de cada ejecución E2E visible, avisar al usuario. El modo `--headed` usa un solo worker y `slowMo: 1000` para facilitar la revisión visual. La pausa es entre operaciones de Playwright, no una espera fija al final de cada pantalla.

**Preparación (una sola vez; el 2026-09-24 se confirmó que el repo existe y está vacío):**
1. Volver a correr `gh repo view Octavillt/pronosticoClimaLluvia` justo antes del primer push, para confirmar que sigue vacío.
2. En `SistemaClima/`, configurar git:
   - `git init -b develop`;
   - `git config user.name "Octavio"` y `git config user.email ovillafranco@gmail.com`;
   - `git remote add origin https://github.com/Octavillt/pronosticoClimaLluvia.git`.
3. Hacer el commit base de la Fase 0 en `develop` y `git push -u origin develop`.
4. Crear `testClimateRain` y `master` desde ese mismo commit, subirlas y fijar master como rama por defecto con `gh repo edit --default-branch master`.
5. **Tú reconectas Hostinger al repo nuevo** con rama `master`, Vite, `pnpm run build`, `dist` y Node 22.x. La conexión anterior se pierde al borrar el repo.

**Flujo por fase:**
1. **`develop`:** implementar, correr `pnpm typecheck && pnpm test:report` hasta tener **100% en verde**. Si una prueba falla, el fix va **directo a `develop`**.
   - Se genera `reportes/unitarias/AAAA-MM-DD_HHmm_<sha7>.md` con:
     - fecha, rama, commit y versión de Node;
     - totales (suites, pruebas, pasadas, fallidas, omitidas) y duración;
     - tabla por archivo con **tipo (unitaria o integración)**, cada prueba y su estado;
     - cobertura por módulo;
     - conclusión.
   - Se actualiza `reportes/README.md`.
   - Commit del código y del reporte, y push.
2. **PR `develop → testClimateRain`** (`gh pr create`), con el resumen del reporte y un enlace al archivo. **Tú haces el merge.**
3. **`testClimateRain`:**
   - `git pull`, `pnpm install` y `pnpm test:e2e:headed`, que corre contra `vite build && vite preview`, igual que el `dist` de Hostinger, así que lo ves en vivo.
   - El reporte queda en `reportes/e2e/…md`, junto con el HTML de Playwright (este último ignorado por git). Se sube en un commit solo de documentación.
   - Te presento el resumen y **tú das el VoBo**.
4. **PR `testClimateRain → master`** con los dos reportes. **Tú haces el merge**, y después "Guardar y reimplementar" en Hostinger si no hay auto-deploy.
5. **Sincronización posterior:** `master` se lleva a `develop` y a `testClimateRain` para que no diverjan (reportes E2E, bugfix y hotfix).

**Defectos:**
- En E2E: `bugfix/bug-<descripcion>` desde `testClimateRain`, PR a `testClimateRain` y se vuelve a correr E2E, con back-merge a `develop`.
- En producción: `hotfix/<descripcion>` desde `master`, PR a `master` (tú lo mergeas) y back-merge a `testClimateRain` y `develop`.

Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y los PRs con el pie de Claude Code.

---

## Pruebas por fase (Fase 0 y Fase 1 en detalle)

**Fase 0:**
- Unitarias de `config` y de la utilidad de hora local.
- Integración: `App` renderiza.
- E2E: la página carga desde el build de producción, con título y sin errores de consola.

**Fase 1, unitarias:**
- `memberPop` (Laplace, nulos, vacío).
- `computePopSeries` (ponderación por miembros, alineación horaria).
- Parser del ensamble (sufijos por modelo, miembros, payload inválido).
- Geohash.
- Caché (TTL y expulsión).
- `mexico.ts`: CDMX dentro; Madrid, El Paso (31.76, −106.48) y Ciudad de Guatemala (14.6, −90.5) fuera.

**Fase 1, integración (MSW + fake-indexeddb + Testing Library):**
- `forecastService`:
  - una sola llamada con los 5 modelos;
  - hit de caché por celda, incluso tras recargar;
  - fallback por modelo con `failedModels`;
  - error si fallan todos;
  - fuera de cobertura, sin llamar a los proveedores.
- `App`:
  - con geolocalización simulada se ve la PoP;
  - con permiso denegado aparece la búsqueda;
  - fuera de México aparece el mensaje.

**Fase 1, E2E con Playwright (`--headed`):**
- Con fixtures vía `page.route` y `context.setGeolocation`:
  - flujo feliz en CDMX;
  - permiso denegado y búsqueda de "Guadalajara";
  - Madrid, con mensaje de fuera de cobertura;
  - Open-Meteo caído, con error y reintento.
- `@vivo` contra Open-Meteo real: ~194 miembros y PoP en [0,1]; se omite si el servicio no responde.

## Verificación de punta a punta

1. `pnpm build` genera `dist/index.html` y `pnpm preview` corre sin errores en consola.
2. En DevTools, las llamadas van directo del navegador a `api.open-meteo.com` y `ensemble-api.open-meteo.com`, sin backend.
3. Los reportes de Vitest y E2E existen en `reportes/` y marcan 100%.
4. Después del merge a `master` y el deploy en Hostinger: abrir el dominio en el celular con HTTPS, permitir la ubicación y ver la PoP actual y por hora. Probar también con el permiso negado y la búsqueda.
