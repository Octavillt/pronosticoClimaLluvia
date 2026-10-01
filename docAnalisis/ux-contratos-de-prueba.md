# Contratos de prueba de la interfaz (Fase 5: UX/UI)

> Lista de lo que las pruebas existentes esperan de la interfaz. El rediseño puede cambiar el aspecto, pero **no** estos contratos, salvo los cambios deliberados de la última sección. Si una prueba falla por algo que no está en esa sección, es una regresión: se corrige el código, no la prueba.
>
> Se obtuvo leyendo `tests/` y `e2e/` el 2026-09-30. Si una prueba nueva añade un contrato, se agrega aquí en la misma tarea.

## 1. Testids y atributos

| Contrato | Dónde se verifica | Detalle |
|---|---|---|
| `data-testid="pop-ahora"` | 8 archivos (App, AppRadar, AppVerificacion, pwaUi, y los E2E pronostico, verificacion, pwa y radar) | `textContent` exacto `"72%"` o `"1%"`: sin espacio, sin unidades extra. Hay `toBe`, `toHaveText` y `parseInt`. Si el número y el `%` van en `<span>` distintos, el contenedor con el testid debe envolverlos a ambos sin texto adicional. |
| `data-testid="origen-pop"` | AppRadar, radar.spec | Su texto debe contener `/radar/i` (con radar) o `/ensamble/`. Textos actuales: "Combina el radar con el ensamble de modelos." y "Basada en el ensamble de modelos.". |
| `data-testid="aviso-calibracion"` | AppVerificacion, verificacion.spec | Texto exacto `Calibrada con tu historial local (150 horas verificadas)`. Debe aparecer **una sola vez** en pantalla (`getByText`). |
| `data-testid="exactitud-observaciones"`, `exactitud-horas`, `exactitud-insuficientes`, `exactitud-pares` | PanelExactitud, AppVerificacion, verificacion.spec | Contienen solo el número (`'0'`, `'30'`, `'150'`). |
| `data-testid="mapa-radar"` | AppRadar (en su propio mock), pwa.spec, radar.spec | En `radar.spec` debe tener la clase `leaflet-container`: el testid va en el **mismo `div`** que recibe Leaflet. |
| `data-testid="hora-fotograma"` | MapaRadar.test, radar.spec | `textContent` exacto `"21:26 h"`. |
| `data-testid="barra-pop-${i}"` y `data-radar="si"/"no"` | AppRadar, radar.spec | `i` es relativo a la primera hora mostrada. `data-radar` es `si` cuando el peso del radar es mayor que 0.05. |
| Hijo `<title>` dentro de cada `barra-pop-*` | radar.spec:146 | `[data-testid^="barra-pop-"] title` con `/(\d+) %/` (espacio normal antes de `%`) y, en AppRadar, `textContent` con `/21:00 a 22:00 h/`. |

## 2. Consultas únicas y estrictas

Estas consultas fallan si hay **más de un** elemento que coincida (modo estricto de Playwright o `getBy*` de Testing Library):

- `getByRole('status')`: en BotonLluvia.test, `verificacion.spec` y pwaUi. No puede haber otro `role="status"` visible mientras se hace una importación de historial.
- `getByRole('alert')`: en App.test y `pronostico.spec`.
- `getByText('Guadalajara', { exact: true })`: el nombre de un lugar buscado debe aparecer como texto exacto **una sola vez**.
- `getByText(/Tu ubicación/)`: una sola vez.
- `getByRole('list').filter({ hasText: 'Ensamble Open-Meteo' })` (`pronostico.spec:46`): debe existir una lista (`ul`/`ol`) con esas líneas y no puede anidarse en otra lista.
- `getByLabelText('Probabilidad de lluvia actual')` y `getByLabelText('Estado de fuentes')` (AppRadar): una sola sección con cada etiqueta.

## 3. Textos literales

- **Encabezados:** `SistemaClima` (siempre presente, incluso mientras carga o en error), `Busca tu ciudad`, `¿Está lloviendo?` y `¿Está lloviendo en {lugar}?` (con `textContent` exacto).
- **Botones:** `Sí, está lloviendo`, `No está lloviendo`, `Usar mi ubicación`, `Buscar`, `Reintentar`, `Actualizar`, `Animar`, `Pausar` (con `aria-pressed`), `Exportar historial`, `Borrar historial`, `Confirmar borrado`, `Cancelar`.
- **Etiquetas:** `Nombre de la ciudad`, `Importar historial` (un `<label>` asociado a un `input[type=file]` real), `Fotograma del radar`, `Probabilidad de lluvia actual`, `Estado de fuentes`.
- **Mensajes:** `Gracias, registrado.`; el mensaje completo de "No se registró: …"; `Historial exportado.`; `Historial borrado.`; `Se agregaron N predicciones y M observaciones.`; los avisos PWA `Hay una versión nueva de SistemaClima.` y `Sin conexión. Puede que el pronóstico no esté actualizado.`
- **Aviso de lugar:** en una ciudad buscada, `Reporta solo lo que ves donde estás: estos reportes calibran el pronóstico de este lugar.` (y en la ubicación geolocalizada **no** debe aparecer esa frase).
- **Fuentes** (cada línea en **un solo** elemento de texto, sin envolver la etiqueta aparte): `Ensamble Open-Meteo: ✓`, `Radar RainViewer: ✓ (imagen de las 21:26 h; la lluvia avanza a 35 km/h hacia el este)`, `Radar RainViewer: consultando…`, `Radar RainViewer: sin cobertura en esta zona (solo ensamble)`, `… hace 55 min y se ignora …`, `Radar RainViewer: no disponible (solo ensamble)`, `Caché: consultado` / `Caché: reutilizado`.
- **Radar:** `(más reciente)` visible solo en el último fotograma.
- **Panel de exactitud:** los textos completos que verifican PanelExactitud.test y `verificacion.spec` (por ejemplo `Calibrado`, `Faltan 140 pares`, `La muestra es pequeña`, los `<caption>` `Resultados por horizonte` y `Datos de confiabilidad`).

Los textos **nuevos** de la fase 5 (mensaje principal, frase, chip de radar, aprendizaje) **no pueden contener** ninguna de estas cadenas: `Tu ubicación`, `Calibrada con tu historial local (`, `sin cobertura en esta zona`, `Radar RainViewer:`, `Caché:`, `hacia el este`, ni el nombre exacto de un lugar buscado.

## 4. Estructura y comportamiento

- `AppRadar.test.tsx` mockea el módulo `../../src/ui/MapaRadar` (ruta y `export default`): no mover ni renombrar ese archivo ni su export.
- `MapaRadar` devuelve `null` sin fotogramas y no puede renderizar ningún `<section>` en ese caso.
- Las tablas del panel de exactitud son `<table>` con `<caption>`; la celda `Calibrado` debe ser única con ese nombre exacto; el diagrama de confiabilidad conserva `circle` con un `<title>` hijo.
- `smoke.spec.ts` exige **cero** `console.error` y `pageerror`: ninguna fuente, imagen o CSS puede dar 404.
- `verificacion.spec.ts` comprueba `scrollWidth <= innerWidth` a 320 px de ancho.
- `pwa.spec.ts` compara el contenido del caché del service worker con la lista `PRECACHE` de `sw.js`: todo archivo nuevo (fuentes, CSS) entra solo si sale del build.
- Ningún test fija niveles de encabezado ni usa capturas o snapshots.
- `getByRole('img', …)`, `getByRole('table', …)` y `getByRole('cell', …)` se usan en el panel y en la gráfica de horas.

## 5. Cambios deliberados de pruebas en esta fase

| Prueba | Tarea | Motivo |
|---|---|---|
| `tests/helpers/ensamble.ts`, `tests/unit/openMeteoEnsemble.test.ts` | T0a (hecha) | La petición pasó a `timezone=auto` + `timeformat=unixtime` |
| `e2e/pronostico.spec.ts` (sección `@vivo`) | T0b (hecha) | Usa `PARAMETROS_TIEMPO` y comprueba la zona real |
| `tests/unit/pwaArchivos.test.ts`, `e2e/pwa.spec.ts` (colores y metas) | T5 | `theme_color` y `background_color` aprobados |
| `e2e/pronostico.spec.ts:45` (`getByRole('img', {name:/próximas horas/})` → `getByRole('list', …)`) | T8 | El carrusel de horas deja de ser una imagen SVG |
| `e2e/verificacion.spec.ts:133` (celda `Calibrado`) | T12 | El panel de exactitud pasa a un detalle que hay que abrir |
| `tests/unit/contrasteAvisos.test.ts` (se borra) | T15 | Se reemplaza por `contrasteTokens.test.ts` (ambos temas) |
