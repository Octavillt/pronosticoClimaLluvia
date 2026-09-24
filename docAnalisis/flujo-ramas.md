# Flujo de ramas — SistemaClima / pronosticoClimaLluvia

> Repo: https://github.com/Octavillt/pronosticoClimaLluvia (público, **nunca se suben llaves**).
> Autor de commits: `Octavio <ovillafranco@gmail.com>` (config local del repo).
> Ramas: `develop` → `testClimateRain` → `master` (default, la que compila Hostinger).

## Preparación (una sola vez)

1. `gh repo view Octavillt/pronosticoClimaLluvia` justo antes del primer push, para confirmar que sigue vacío.
2. En `SistemaClima/`:
   - `git init -b develop`
   - `git config user.name "Octavio"` y `git config user.email ovillafranco@gmail.com`
   - `git remote add origin https://github.com/Octavillt/pronosticoClimaLluvia.git`
3. Commit base de la Fase 0 en `develop` y `git push -u origin develop`.
4. Crear `testClimateRain` y `master` desde ese mismo commit, subirlas y fijar master como default: `gh repo edit --default-branch master`.
5. **El usuario reconecta Hostinger** con rama `master`, preset Vite, `pnpm run build`, salida `dist` y Node 22.x.

## Flujo por fase

1. **`develop`:** implementar y correr `pnpm typecheck && pnpm test:report` hasta tener **100% en verde**. Si una prueba falla, el fix va directo a `develop`.
   - Se genera `reportes/unitarias/AAAA-MM-DD_HHmm_<sha7>.md` con: fecha, rama, commit y versión de Node; totales (suites, pruebas, pasadas, fallidas, omitidas) y duración; tabla por archivo con **tipo (unitaria o integración)**, cada prueba y su estado; cobertura por módulo; conclusión.
   - Se actualiza `reportes/README.md` (el más reciente primero).
   - Commit del código y del reporte, y push.
2. **PR `develop → testClimateRain`** (`gh pr create`), con el resumen del reporte y enlace al archivo. **El usuario hace el merge.**
3. **`testClimateRain`:**
   - `git pull`, `pnpm install` y `pnpm test:e2e:headed`, que corre contra `vite build && vite preview` (igual que el `dist` de Hostinger), en modo headed para verlo en vivo.
   - El reporte queda en `reportes/e2e/…md`, junto con el HTML de Playwright (ignorado por git). Se sube en un commit solo de documentación.
   - Se presenta el resumen y **el usuario da el VoBo**.
4. **PR `testClimateRain → master`** con los dos reportes. **El usuario hace el merge**, y después "Guardar y reimplementar" en Hostinger si no hay auto-deploy.
5. **Sincronización posterior:** `master` se lleva a `develop` y a `testClimateRain` para que no diverjan (reportes E2E, bugfix y hotfix).

## Defectos

- **En E2E:** `bugfix/bug-<descripcion>` desde `testClimateRain`, PR a `testClimateRain`, se vuelve a correr E2E, con back-merge a `develop`.
- **En producción:** `hotfix/<descripcion>` desde `master`, PR a `master` (el usuario lo mergea) y back-merge a `testClimateRain` y `develop`.

## Convenciones

- Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y los PRs con el pie de Claude Code.
- Página única, sin router: no depende de `.htaccess`.
- La llave de Google (si llega a usarse, Fase 5) va solo en "Variables de entorno" de Hostinger, nunca en el repo.
